/**
 * claude-twin — command dispatcher.
 *
 * Registry of named action handlers. Lives in the service worker so action
 * implementations can use the full extension API surface (chrome.tabs,
 * chrome.scripting, chrome.tabGroups, …). The offscreen document forwards
 * inbound `command` WS messages here via `chrome.runtime.sendMessage` and
 * wraps the response back into a `response` WS message.
 *
 * Built-in: `ping`. Per-platform actions (gmail/slack/etc.) register
 * themselves from their own modules.
 */

const actions = new Map();

/**
 * Register an async action handler.
 * @param {string} name e.g. 'ping', 'tabs', 'open'
 * @param {(params: Record<string, unknown>) => Promise<unknown>} fn
 */
export function registerAction(name, fn) {
  actions.set(name, fn);
}

export function getAction(name) {
  return actions.get(name);
}

export function listActions() {
  return [...actions.keys()];
}

/**
 * Dispatch a command and produce the response shape (without `id` —
 * the caller adds that). `{ result }` on success, `{ error }` on failure.
 */
export async function dispatch(action, params = {}) {
  const fn = actions.get(action);
  if (!fn) {
    return { error: { message: `unknown action: ${action}`, code: 'UNKNOWN_ACTION' } };
  }
  try {
    const result = await fn(params);
    return { result: result === undefined ? null : result };
  } catch (err) {
    return {
      error: {
        message: err instanceof Error ? err.message : String(err),
        code: 'ACTION_FAILED',
      },
    };
  }
}

// ─── Built-in: ping ───────────────────────────────────────────────────────

registerAction('ping', async () => ({
  pong: true,
  ts: Date.now(),
  version: chrome.runtime.getManifest().version,
}));
