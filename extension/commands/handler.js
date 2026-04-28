/**
 * claude-twin — command handler.
 *
 * Receives `command` messages forwarded from the offscreen WebSocket bridge
 * (via `chrome.runtime.sendMessage` to the service worker), dispatches them
 * to the registered action functions, and returns the result back to the
 * offscreen for the WS reply.
 *
 * For #6 (command bus protocol) we register a single `ping` action so the
 * round-trip path is testable end-to-end. Real browser actions (search,
 * read, send, click, fill, etc.) land in #7+ as additional registrations.
 */

const actions = new Map();

/**
 * Register an async action handler.
 * @param {string} name action name (e.g. 'ping', 'tabs', 'open')
 * @param {(params: Record<string, unknown>) => Promise<unknown>} fn
 */
export function registerAction(name, fn) {
  actions.set(name, fn);
}

/**
 * Look up an action by name.
 * @param {string} name
 * @returns {((params: Record<string, unknown>) => Promise<unknown>) | undefined}
 */
export function getAction(name) {
  return actions.get(name);
}

export function listActions() {
  return [...actions.keys()];
}

/**
 * Dispatch a command and produce the response payload (without the id —
 * the caller adds that). Returns `{ result }` on success or `{ error }`
 * on failure, matching the wire protocol.
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

// ─── Built-in actions ─────────────────────────────────────────────────────

registerAction('ping', async () => ({
  pong: true,
  ts: Date.now(),
  version: chrome.runtime.getManifest().version,
}));
