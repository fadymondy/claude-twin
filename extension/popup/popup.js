/**
 * claude-twin — popup.
 *
 * Tabbed UI: Status / Monitors / Scripts / Permissions. All data is read
 * either directly from chrome.storage.local (the offscreen + monitor
 * manager keep it up to date) or via POPUP_REQUEST messages handled in
 * the service worker.
 */

const els = {
  version: document.getElementById('version'),
  wsStatus: document.getElementById('ws-status'),
  authStatus: document.getElementById('auth-status'),
  alertsToday: document.getElementById('alerts-today'),
  enabled: document.getElementById('enabled'),
  privacy: document.getElementById('privacy'),
  tabs: document.querySelectorAll('.tab'),
  panes: document.querySelectorAll('.pane'),
  monitorsList: document.getElementById('monitors-list'),
  monitorsEmpty: document.getElementById('monitors-empty'),
  scriptsList: document.getElementById('scripts-list'),
  scriptsEmpty: document.getElementById('scripts-empty'),
  permsList: document.getElementById('perms-list'),
  meetingPrompt: document.getElementById('meeting-prompt'),
  meetingPlatform: document.getElementById('meeting-platform'),
  meetingApprove: document.getElementById('meeting-approve'),
  meetingDeny: document.getElementById('meeting-deny'),
};

const PLATFORM_ORIGINS = [
  ['Gmail', '*://mail.google.com/*'],
  ['Slack', '*://app.slack.com/*'],
  ['WhatsApp', '*://web.whatsapp.com/*'],
  ['Discord', '*://discord.com/*'],
  ['Telegram', '*://web.telegram.org/*'],
  ['X (Twitter)', '*://x.com/*'],
  ['GitHub', '*://github.com/*'],
  ['Linear', '*://linear.app/*'],
  ['Jira', '*://*.atlassian.net/*'],
  ['Google Calendar', '*://calendar.google.com/*'],
  ['Cal.com', '*://app.cal.com/*'],
  ['Google Meet', '*://meet.google.com/*'],
  ['Zoom', '*://app.zoom.us/*'],
  ['GCP Console', '*://console.cloud.google.com/*'],
  ['Claude.ai', '*://claude.ai/*'],
  ['OpenAI Platform', '*://platform.openai.com/*'],
  ['Perplexity', '*://perplexity.ai/*'],
];

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

function activateTab(name) {
  els.tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  els.panes.forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== name));
  if (name === 'monitors') void renderMonitors();
  if (name === 'scripts') void renderScripts();
  if (name === 'perms') void renderPerms();
}

els.tabs.forEach((t) => t.addEventListener('click', () => activateTab(t.dataset.tab)));

async function renderStatus() {
  const response = await send('getStatus');
  if (!response?.ok) {
    els.wsStatus.textContent = 'unavailable';
    els.wsStatus.className = 'value disconnected';
    return;
  }
  const { wsConnected, authStatus, enabled, privacyMode, alertsToday, version } = response.data;
  els.version.textContent = `v${version}`;
  els.wsStatus.textContent = wsConnected ? 'connected' : 'disconnected';
  els.wsStatus.className = `value ${wsConnected ? 'connected' : 'disconnected'}`;
  els.authStatus.textContent = authStatus;
  els.alertsToday.textContent = String(alertsToday);
  els.enabled.checked = !!enabled;
  els.privacy.checked = !!privacyMode;
}

async function renderMonitors() {
  const stored = await chrome.storage.local.get(['monitorConfigs', 'monitorLastResults']);
  const monitors = stored.monitorConfigs || [];
  const last = stored.monitorLastResults || {};
  els.monitorsList.innerHTML = '';
  if (monitors.length === 0) {
    els.monitorsEmpty.classList.remove('hidden');
    return;
  }
  els.monitorsEmpty.classList.add('hidden');
  for (const m of monitors) {
    const li = document.createElement('li');
    const lastTs = last[m.slug];
    const ago = lastTs ? formatAgo(Date.now() - lastTs) : 'never';
    li.innerHTML = `
      <div class="meta">
        <strong>${escapeHtml(m.slug)}</strong>
        <span class="muted">every ${m.intervalMin}m · last ${escapeHtml(ago)}</span>
      </div>
    `;
    els.monitorsList.appendChild(li);
  }
}

async function renderScripts() {
  const stored = await chrome.storage.local.get('dynamicScripts');
  const scripts = Object.values(stored.dynamicScripts || {});
  els.scriptsList.innerHTML = '';
  if (scripts.length === 0) {
    els.scriptsEmpty.classList.remove('hidden');
    return;
  }
  els.scriptsEmpty.classList.add('hidden');
  for (const s of scripts) {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="meta">
        <strong>${escapeHtml(s.id)}</strong>
        <span class="muted">${escapeHtml(s.domain)} · ${s.active ? 'active' : 'paused'}</span>
      </div>
      <div>
        <button data-act="toggle" data-id="${escapeHtml(s.id)}">${s.active ? 'pause' : 'enable'}</button>
        <button data-act="unload" data-id="${escapeHtml(s.id)}">remove</button>
      </div>
    `;
    els.scriptsList.appendChild(li);
  }
  els.scriptsList.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (act === 'toggle') {
        const stored = await chrome.storage.local.get('dynamicScripts');
        const scripts = stored.dynamicScripts || {};
        if (scripts[id]) scripts[id].active = !scripts[id].active;
        await chrome.storage.local.set({ dynamicScripts: scripts });
      } else if (act === 'unload') {
        const stored = await chrome.storage.local.get('dynamicScripts');
        const scripts = stored.dynamicScripts || {};
        delete scripts[id];
        await chrome.storage.local.set({ dynamicScripts: scripts });
      }
      void renderScripts();
    });
  });
}

async function renderPerms() {
  const all = await chrome.permissions.getAll();
  const granted = new Set(all.origins || []);
  els.permsList.innerHTML = '';
  for (const [name, origin] of PLATFORM_ORIGINS) {
    const li = document.createElement('li');
    const isOn = granted.has(origin);
    li.innerHTML = `
      <div class="meta">
        <strong>${escapeHtml(name)}</strong>
        <span class="muted">${escapeHtml(origin)}</span>
      </div>
      <div>
        <button data-origin="${escapeHtml(origin)}" data-on="${isOn ? '1' : '0'}">${isOn ? 'revoke' : 'grant'}</button>
      </div>
    `;
    els.permsList.appendChild(li);
  }
  els.permsList.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const origin = btn.dataset.origin;
      const isOn = btn.dataset.on === '1';
      if (isOn) {
        await chrome.permissions.remove({ origins: [origin] }).catch(() => undefined);
      } else {
        await chrome.permissions.request({ origins: [origin] }).catch(() => undefined);
      }
      void renderPerms();
    });
  });
}

async function renderMeetingPrompt() {
  const { pendingMeetingOptIn } = await chrome.storage.local.get('pendingMeetingOptIn');
  if (pendingMeetingOptIn) {
    els.meetingPrompt.classList.remove('hidden');
    els.meetingPlatform.textContent =
      pendingMeetingOptIn.platform || pendingMeetingOptIn.source || 'A meeting';
  } else {
    els.meetingPrompt.classList.add('hidden');
  }
}

els.meetingApprove?.addEventListener('click', async () => {
  const { pendingMeetingOptIn } = await chrome.storage.local.get('pendingMeetingOptIn');
  if (!pendingMeetingOptIn) return;
  await send('approveMeetingCaptions', { meetingSource: pendingMeetingOptIn.source });
  await renderMeetingPrompt();
});

els.meetingDeny?.addEventListener('click', async () => {
  await send('denyMeetingCaptions');
  await renderMeetingPrompt();
});

els.enabled.addEventListener('change', async (e) => {
  await send('setEnabled', { value: e.target.checked });
  void renderStatus();
});

els.privacy.addEventListener('change', async (e) => {
  await send('setPrivacyMode', { value: e.target.checked });
  void renderStatus();
});

function formatAgo(ms) {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

document.addEventListener('DOMContentLoaded', async () => {
  activateTab('status');
  await renderStatus();
  await renderMeetingPrompt();
});
