/**
 * claude-twin — dynamic script engine.
 *
 * Lets the MCP server push JS to the extension that auto-injects on tabs
 * matching a domain. Scripts persist in `chrome.storage.local` so they
 * survive SW restarts; on `tabs.onUpdated` complete, every active script
 * whose domain matches the tab is injected.
 */

const STORAGE_KEY = 'dynamicScripts';

export class ScriptEngine {
  /** @returns {Promise<Record<string, ScriptDefinition>>} */
  async getAll() {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    return stored[STORAGE_KEY] || {};
  }

  async get(id) {
    const all = await this.getAll();
    return all[id] || null;
  }

  /**
   * @param {ScriptDefinition} script
   */
  async load(script) {
    if (!script || typeof script !== 'object') throw new Error('script object required');
    const id = String(script.id || '').trim();
    const domain = String(script.domain || '').trim();
    const code = String(script.code || '');
    if (!id) throw new Error('script.id required');
    if (!domain) throw new Error('script.domain required (e.g. "example.com")');
    if (!code) throw new Error('script.code required');

    const all = await this.getAll();
    all[id] = {
      id,
      domain,
      code,
      active: script.active !== false,
      loadedAt: Date.now(),
      runAt: script.runAt || 'document_idle',
    };
    await chrome.storage.local.set({ [STORAGE_KEY]: all });
    return all[id];
  }

  async unload(id) {
    const all = await this.getAll();
    if (!all[id]) return { unloaded: false, reason: 'unknown id' };
    delete all[id];
    await chrome.storage.local.set({ [STORAGE_KEY]: all });
    return { unloaded: true, id };
  }

  async toggle(id, active) {
    const all = await this.getAll();
    if (!all[id]) throw new Error(`unknown script: ${id}`);
    all[id].active = !!active;
    await chrome.storage.local.set({ [STORAGE_KEY]: all });
    return all[id];
  }

  /** Inject a script into a single tab regardless of its `active` flag. */
  async inject(tabId, script) {
    const code = typeof script === 'string' ? script : script?.code;
    if (!code) throw new Error('inject: code required');
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (body) => {
        const fn = new Function(body);
        return fn();
      },
      args: [code],
      world: 'MAIN',
    });
    return results?.[0]?.result ?? null;
  }

  /** One-shot evaluation on whichever tab(s) currently match the domain. */
  async runOnDomain(domain, code) {
    const tabs = await chrome.tabs.query({});
    const matches = tabs.filter((t) => {
      try {
        return new URL(t.url || '').hostname.endsWith(domain);
      } catch {
        return false;
      }
    });
    if (matches.length === 0) {
      return { ran: false, reason: `no open tab matching ${domain}` };
    }
    const results = [];
    for (const t of matches) {
      if (t.id === undefined) continue;
      try {
        results.push({ tabId: t.id, result: await this.inject(t.id, code) });
      } catch (err) {
        results.push({ tabId: t.id, error: err.message });
      }
    }
    return { ran: true, results };
  }
}

/**
 * @typedef {Object} ScriptDefinition
 * @property {string} id
 * @property {string} domain  e.g. "github.com"
 * @property {string} code
 * @property {boolean} [active]
 * @property {number} [loadedAt]
 * @property {string} [runAt]
 */
