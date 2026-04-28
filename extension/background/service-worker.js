/**
 * claude-twin — service worker (MV3)
 *
 * For #4 (scaffold) this only does the bare minimum to load cleanly:
 *   - install / startup hooks initialise default storage
 *   - message router dispatches POPUP_REQUEST.getStatus
 *   - ensureOffscreenDocument() lazy-creates the offscreen doc
 *
 * The real WebSocket bridge (#5), command bus (#6), monitor manager (#11),
 * and meeting/captions handling are out of scope for this issue.
 */

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

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  console.log('[claude-twin] installed:', reason);

  const existing = await chrome.storage.local.get(['enabled', 'privacyMode', 'alertsToday']);
  if (existing.enabled === undefined) {
    await chrome.storage.local.set({
      enabled: true,
      privacyMode: false,
      alertsToday: 0,
      wsConnected: false,
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
});

async function handlePopupRequest(message, sendResponse) {
  const { action } = message;

  if (action === 'getStatus') {
    const data = await chrome.storage.local.get([
      'wsConnected',
      'enabled',
      'privacyMode',
      'alertsToday',
    ]);
    sendResponse({
      ok: true,
      data: {
        wsConnected: !!data.wsConnected,
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
    sendResponse({ ok: true });
    return;
  }

  if (action === 'setPrivacyMode') {
    await chrome.storage.local.set({ privacyMode: !!message.value });
    sendResponse({ ok: true });
    return;
  }

  sendResponse({ ok: false, error: `Unknown action: ${action}` });
}
