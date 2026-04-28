/**
 * claude-twin — dynamic ScriptEngine actions.
 *
 * Wires the ScriptEngine instance into the SW dispatcher and arms
 * `tabs.onUpdated` to auto-inject active scripts whose domain matches
 * the loaded tab's host.
 */

import { registerAction } from './handler.js';
import { ScriptEngine } from '../engine/script-engine.js';

const engine = new ScriptEngine();

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (info.status !== 'complete' || !tab.url) return;
  if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;

  let host;
  try {
    host = new URL(tab.url).hostname;
  } catch {
    return;
  }

  const scripts = await engine.getAll();
  for (const s of Object.values(scripts)) {
    if (s.active && host.endsWith(s.domain)) {
      await engine.inject(tabId, s).catch((err) => {
        console.warn(`[claude-twin] auto-inject ${s.id} failed:`, err.message);
      });
    }
  }
});

registerAction('script_load', async ({ script }) => engine.load(script));

registerAction('script_unload', async ({ id }) => engine.unload(String(id || '')));

registerAction('script_toggle', async ({ id, active }) =>
  engine.toggle(String(id || ''), !!active),
);

registerAction('script_list', async () => ({ scripts: await engine.getAll() }));

registerAction('script_run', async ({ domain, code }) => {
  if (!domain) throw new Error('script_run: domain required');
  if (!code) throw new Error('script_run: code required');
  return engine.runOnDomain(String(domain), String(code));
});
