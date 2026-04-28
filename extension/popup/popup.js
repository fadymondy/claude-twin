/**
 * claude-twin — popup.
 *
 * Pulls status from the service worker and renders it. Toggle changes
 * round-trip back through the SW so storage stays the source of truth.
 */

const els = {
  version: document.getElementById('version'),
  wsStatus: document.getElementById('ws-status'),
  alertsToday: document.getElementById('alerts-today'),
  enabled: document.getElementById('enabled'),
  privacy: document.getElementById('privacy'),
};

function send(action, extra = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'POPUP_REQUEST', action, ...extra }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response);
    });
  });
}

async function refresh() {
  const response = await send('getStatus');
  if (!response?.ok) {
    els.wsStatus.textContent = 'unavailable';
    els.wsStatus.className = 'value disconnected';
    return;
  }

  const { wsConnected, enabled, privacyMode, alertsToday, version } = response.data;
  els.version.textContent = `v${version}`;
  els.wsStatus.textContent = wsConnected ? 'connected' : 'disconnected';
  els.wsStatus.className = `value ${wsConnected ? 'connected' : 'disconnected'}`;
  els.alertsToday.textContent = String(alertsToday);
  els.enabled.checked = !!enabled;
  els.privacy.checked = !!privacyMode;
}

els.enabled.addEventListener('change', async (e) => {
  await send('setEnabled', { value: e.target.checked });
  refresh();
});

els.privacy.addEventListener('change', async (e) => {
  await send('setPrivacyMode', { value: e.target.checked });
  refresh();
});

document.addEventListener('DOMContentLoaded', refresh);
