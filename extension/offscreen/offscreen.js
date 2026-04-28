/**
 * claude-twin — offscreen document (ES module).
 *
 * Maintains a persistent WebSocket connection to the local MCP server's
 * bridge on ws://127.0.0.1:9997/twin. The offscreen document outlives the
 * service worker, so the WS stays warm across SW idle/restart cycles.
 *
 * Wire protocol (mirrored from mcp-server/src/bridge/protocol.ts):
 *   →  auth      { type: 'auth', token, extension_id }
 *   ←  auth_ok / auth_fail
 *   →  ping      ←  pong
 *   ←  command   { type: 'command', id, action, params? }   (server → ext)
 *   →  response  { type: 'response', id, result | error }    (ext → server)
 *   →  event     { type: 'event', source, eventType, data, timestamp }
 */

const WS_URL = 'ws://127.0.0.1:9997/twin';
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const PING_INTERVAL_MS = 25000;
const PONG_TIMEOUT_MS = 10000;
const MAX_QUEUE_SIZE = 500;

let ws = null;
let reconnectAttempt = 0;
let reconnectTimer = null;
let pingTimer = null;
let pongDeadline = null;
let isConnected = false;
let token = null;
const extensionId = chrome.runtime.id;
let offlineQueue = [];

function init() {
  chrome.runtime.sendMessage({ type: 'OFFSCREEN_INIT' }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('[claude-twin:offscreen] init failed:', chrome.runtime.lastError.message);
      // Connect anyway — token is optional in dev mode
      connect();
      return;
    }
    if (response) {
      token = response.token || null;
      if (response.enabled !== false) {
        connect();
      }
    } else {
      connect();
    }
  });
}

function connect() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  console.log(`[claude-twin:offscreen] connecting to ${WS_URL} (attempt ${reconnectAttempt + 1})`);

  try {
    ws = new WebSocket(WS_URL);
  } catch (err) {
    console.error('[claude-twin:offscreen] WebSocket creation failed:', err);
    scheduleReconnect();
    return;
  }

  ws.onopen = handleOpen;
  ws.onmessage = handleMessage;
  ws.onerror = handleError;
  ws.onclose = handleClose;
}

function handleOpen() {
  console.log('[claude-twin:offscreen] connected');
  isConnected = true;
  reconnectAttempt = 0;

  notifyServiceWorker('STATUS_UPDATE', { wsConnected: true });

  send({ type: 'auth', token, extension_id: extensionId });

  startPingLoop();
  flushQueue();
}

function handleMessage(event) {
  let msg;
  try {
    msg = JSON.parse(event.data);
  } catch {
    console.warn('[claude-twin:offscreen] unparseable message');
    return;
  }

  switch (msg.type) {
    case 'auth_ok':
      console.log('[claude-twin:offscreen] auth_ok');
      notifyServiceWorker('AUTH_STATUS', { status: 'authenticated' });
      break;

    case 'auth_fail':
      console.error('[claude-twin:offscreen] auth_fail:', msg.reason);
      notifyServiceWorker('AUTH_STATUS', { status: 'failed', error: msg.reason });
      break;

    case 'pong':
      pongDeadline = null;
      break;

    case 'ack':
      break;

    case 'command':
      void handleCommand(msg);
      break;

    default:
      console.log('[claude-twin:offscreen] unhandled message:', msg.type);
  }
}

async function handleCommand(msg) {
  if (!msg.id || !msg.action) {
    console.warn('[claude-twin:offscreen] malformed command (missing id/action)');
    return;
  }
  let response;
  try {
    response = await chrome.runtime.sendMessage({
      type: 'EXECUTE_COMMAND',
      action: msg.action,
      params: msg.params || {},
    });
  } catch (err) {
    response = { error: { message: err?.message || 'service worker unavailable' } };
  }
  const wire = { type: 'response', id: msg.id };
  if (response?.error) wire.error = response.error;
  else wire.result = response?.result ?? null;
  send(wire);
}

function handleError() {
  console.warn('[claude-twin:offscreen] WebSocket error');
}

function handleClose(event) {
  console.log(`[claude-twin:offscreen] disconnected (code=${event.code})`);
  isConnected = false;
  stopPingLoop();
  notifyServiceWorker('STATUS_UPDATE', { wsConnected: false });

  if (event.code !== 1000) {
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;

  const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt), RECONNECT_MAX_MS);

  console.log(`[claude-twin:offscreen] reconnecting in ${delay}ms`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectAttempt += 1;
    connect();
  }, delay);
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempt = 0;
  stopPingLoop();

  if (ws) {
    try {
      ws.close(1000, 'user disconnect');
    } catch {
      /* ignore */
    }
    ws = null;
  }
  isConnected = false;
}

function startPingLoop() {
  stopPingLoop();
  pingTimer = setInterval(() => {
    if (!isConnected) return;
    if (!send({ type: 'ping' })) return;
    pongDeadline = Date.now() + PONG_TIMEOUT_MS;
    setTimeout(() => {
      if (pongDeadline && Date.now() >= pongDeadline) {
        console.warn('[claude-twin:offscreen] missed pong, dropping connection');
        try {
          ws?.close(4000, 'missed pong');
        } catch {
          /* ignore */
        }
      }
    }, PONG_TIMEOUT_MS + 100);
  }, PING_INTERVAL_MS);
}

function stopPingLoop() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
  pongDeadline = null;
}

function send(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

function sendOrQueue(payload) {
  if (send(payload)) return;
  if (offlineQueue.length >= MAX_QUEUE_SIZE) {
    offlineQueue.shift();
  }
  offlineQueue.push({ ...payload, _queuedAt: Date.now() });
}

function flushQueue() {
  if (offlineQueue.length === 0) return;
  console.log(`[claude-twin:offscreen] flushing ${offlineQueue.length} queued messages`);

  let sent = 0;
  for (const item of offlineQueue) {
    if (!send(item)) break;
    sent += 1;
  }
  offlineQueue = offlineQueue.slice(sent);
}

function notifyServiceWorker(event, data) {
  chrome.runtime.sendMessage({ type: 'OFFSCREEN_EVENT', event, data }).catch(() => {
    /* SW may be asleep — ok */
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== 'offscreen') return;
  const { payload } = message;

  if (payload?.type === 'CONTROL') {
    if (payload.command === 'connect') connect();
    if (payload.command === 'disconnect') disconnect();
    if (payload.command === 'update_token') {
      token = payload.token;
      if (isConnected) {
        send({ type: 'auth', token, extension_id: extensionId });
      }
    }
    sendResponse({ ok: true });
    return;
  }

  // Future: queue arbitrary outbound payloads (lands in #6).
  sendOrQueue(payload);
  sendResponse({ ok: true, queued: !isConnected });
});

init();
