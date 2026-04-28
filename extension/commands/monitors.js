/**
 * claude-twin — monitor manager.
 *
 * Receives a list of `MonitorConfig` from the MCP server (action
 * `set_monitors`), creates one chrome alarm per config, and on each alarm
 * fire opens / refreshes / reads the target URL. Realtime platforms
 * (whatsapp/slack/discord/telegram) read from an existing tab without
 * reload; everything else reloads-then-reads or opens a temporary
 * background tab.
 *
 * Results push back to the MCP server as
 *   { type: 'event', source: <slug>, eventType: 'twin_log', data, timestamp }
 */

import { registerAction } from './handler.js';

const STORAGE_KEY = 'monitorConfigs';
const ALARM_PREFIX = 'monitor:';

const REALTIME_SLUGS = new Set(['whatsapp', 'slack', 'discord', 'telegram']);

registerAction('set_monitors', async ({ monitors }) => {
  if (!Array.isArray(monitors)) throw new Error('set_monitors: monitors must be an array');

  await chrome.storage.local.set({ [STORAGE_KEY]: monitors });

  const wantedNames = new Set(monitors.map((m) => alarmNameFor(m.slug)));
  const existing = await chrome.alarms.getAll();
  for (const a of existing) {
    if (a.name.startsWith(ALARM_PREFIX) && !wantedNames.has(a.name)) {
      await chrome.alarms.clear(a.name);
    }
  }

  for (const m of monitors) {
    const name = alarmNameFor(m.slug);
    const cur = await chrome.alarms.get(name);
    if (!cur || cur.periodInMinutes !== m.intervalMin) {
      await chrome.alarms.clear(name);
      chrome.alarms.create(name, {
        periodInMinutes: m.intervalMin,
        delayInMinutes: 0.25,
      });
    }
  }

  return { active: monitors.length };
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const slug = alarm.name.slice(ALARM_PREFIX.length);

  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const monitors = stored[STORAGE_KEY] || [];
  const cfg = monitors.find((m) => m.slug === slug);
  if (!cfg) {
    chrome.alarms.clear(alarm.name);
    return;
  }

  const { enabled } = await chrome.storage.local.get('enabled');
  if (enabled === false) return;

  await runMonitor(cfg).catch((err) => {
    console.warn(`[claude-twin] monitor "${slug}" failed:`, err.message);
    pushTwinLog(slug, { error: err.message });
  });
});

async function runMonitor(cfg) {
  let tab = null;
  let createdTab = false;
  const realtime = cfg.realtime ?? REALTIME_SLUGS.has(cfg.slug);

  try {
    const host = new URL(cfg.url).hostname;
    const matches = await chrome.tabs.query({ url: `*://${host}/*` });
    if (matches.length > 0) {
      tab = matches[0];
      if (!realtime) {
        await chrome.tabs.reload(tab.id);
        await waitForTabComplete(tab.id, 15_000);
      }
    } else {
      tab = await chrome.tabs.create({ url: cfg.url, active: false });
      createdTab = true;
      await waitForTabComplete(tab.id, 15_000);
    }

    const data = await extract(tab.id, cfg.monitorScript);
    pushTwinLog(cfg.slug, data);
  } finally {
    if (createdTab && tab?.id !== undefined) {
      chrome.tabs.remove(tab.id).catch(() => undefined);
    }
  }
}

async function extract(tabId, monitorScript) {
  if (monitorScript) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (body) => new Function(body)(),
      args: [monitorScript],
      world: 'MAIN',
    });
    return results?.[0]?.result ?? null;
  }
  // Default: page title + first 2000 chars of body text + URL
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      title: document.title,
      url: location.href,
      text: document.body?.innerText?.slice(0, 2000) || '',
    }),
  });
  return results?.[0]?.result ?? null;
}

function pushTwinLog(slug, data) {
  chrome.runtime
    .sendMessage({
      target: 'offscreen',
      payload: {
        type: 'event',
        source: slug,
        eventType: 'twin_log',
        data,
        timestamp: Date.now(),
      },
    })
    .catch(() => undefined);
}

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`tab load timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 250);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function alarmNameFor(slug) {
  return ALARM_PREFIX + slug;
}
