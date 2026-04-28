/**
 * claude-twin — service worker (MV3, ES module).
 *
 * - Owns the offscreen document lifecycle.
 * - Routes popup messages.
 * - Hosts the command dispatcher (chrome.tabs / chrome.scripting / chrome.tabGroups
 *   are only available from extension contexts that have the right permissions —
 *   the SW does, the offscreen does not, so dispatch lives here).
 * - Forwards control + outbound payloads to the offscreen WS bridge.
 */

import { dispatch as dispatchCommand } from '../commands/handler.js';
import '../commands/tabs.js';

const OFFSCREEN_URL = chrome.runtime.getURL('offscreen/offscreen.html');

let offscreenCreating = null;

async function ensureOffscreenDocument() {
  const existing = await chrome.offscreen.hasDocument?.();
  if (existing) return;

  if (offscreenCreating) {
    await offscreenCreating;
    return;
  }

  offscreenCreating = chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['LOCAL_STORAGE'],
    justification: 'Maintain persistent WebSocket connection to the local claude-twin MCP server.',
  });

  try {
    await offscreenCreating;
  } finally {
    offscreenCreating = null;
  }
}

async function forwardToOffscreen(payload) {
  await ensureOffscreenDocument();
  return chrome.runtime.sendMessage({ target: 'offscreen', payload });
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  console.log('[claude-twin] installed:', reason);

  const existing = await chrome.storage.local.get(['enabled', 'privacyMode', 'alertsToday']);
  if (existing.enabled === undefined) {
    await chrome.storage.local.set({
      enabled: true,
      privacyMode: false,
      alertsToday: 0,
      wsConnected: false,
      authStatus: 'pending',
    });
  }

  await ensureOffscreenDocument();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureOffscreenDocument();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return;

  if (message.type === 'POPUP_REQUEST') {
    handlePopupRequest(message, sendResponse);
    return true;
  }

  if (message.type === 'OFFSCREEN_INIT') {
    chrome.storage.local.get(['token', 'enabled']).then((data) => {
      sendResponse({ token: data.token || null, enabled: data.enabled !== false });
    });
    return true;
  }

  if (message.type === 'OFFSCREEN_EVENT') {
    handleOffscreenEvent(message.event, message.data);
    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'EXECUTE_COMMAND') {
    dispatchCommand(message.action, message.params || {})
      .then((response) => sendResponse(response))
      .catch((err) => sendResponse({ error: { message: err?.message || String(err) } }));
    return true; // async sendResponse
  }
});

async function handleOffscreenEvent(event, data) {
  switch (event) {
    case 'STATUS_UPDATE':
      await chrome.storage.local.set(data);
      break;
    case 'AUTH_STATUS':
      await chrome.storage.local.set({ authStatus: data.status, authError: data.error || null });
      break;
    case 'SERVER_CONFIG':
      await chrome.storage.local.set({ serverConfig: data });
      break;
    case 'ALERT': {
      const store = await chrome.storage.local.get('alertsToday');
      await chrome.storage.local.set({ alertsToday: (store.alertsToday || 0) + 1 });
      break;
    }
  }
}

async function handlePopupRequest(message, sendResponse) {
  const { action } = message;

  if (action === 'getStatus') {
    const data = await chrome.storage.local.get([
      'wsConnected',
      'enabled',
      'privacyMode',
      'alertsToday',
      'authStatus',
      'authError',
    ]);
    sendResponse({
      ok: true,
      data: {
        wsConnected: !!data.wsConnected,
        authStatus: data.authStatus || 'pending',
        authError: data.authError || null,
        enabled: data.enabled !== false,
        privacyMode: !!data.privacyMode,
        alertsToday: data.alertsToday || 0,
        version: chrome.runtime.getManifest().version,
      },
    });
    return;
  }

  if (action === 'setEnabled') {
    await chrome.storage.local.set({ enabled: !!message.value });
    await forwardToOffscreen({
      type: 'CONTROL',
      command: message.value ? 'connect' : 'disconnect',
    });
    sendResponse({ ok: true });
    return;
  }

  if (action === 'setPrivacyMode') {
    await chrome.storage.local.set({ privacyMode: !!message.value });
    sendResponse({ ok: true });
    return;
  }

  if (action === 'setToken') {
    await chrome.storage.local.set({ token: message.value || null });
    await forwardToOffscreen({
      type: 'CONTROL',
      command: 'update_token',
      token: message.value || null,
    });
    sendResponse({ ok: true });
    return;
  }

  sendResponse({ ok: false, error: `Unknown action: ${action}` });
}
