/**
 * Hand-mirrored copy of the wire protocol from
 * `mcp-server/src/bridge/protocol.ts`. Keep them in sync — there is no
 * build-time link between the two trees in v1.
 *
 * Envelope shapes (informational, JSDoc-only):
 *
 *   command    server → ext   { type: 'command', id, action, params? }
 *   response   ext    → server { type: 'response', id, result | error }
 *   event      ext    → server { type: 'event', source, eventType, data, timestamp }
 */

export const WS_PATH = '/twin';
export const DEFAULT_WS_PORT = 9997;
export const DEFAULT_WS_HOST = '127.0.0.1';
