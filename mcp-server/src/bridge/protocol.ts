/**
 * Wire protocol shared between the MCP server's WebSocket bridge and the
 * Chrome extension's offscreen document.
 *
 * Three envelope kinds flow over the socket:
 *
 *  - **auth / control** (`auth`, `auth_ok`, `auth_fail`, `ping`, `pong`) —
 *    connection lifecycle, handled by `WsBridge` itself.
 *  - **command / response** — the bidirectional RPC the MCP tools use to
 *    drive the browser. `command` is server → client, `response` is the
 *    client's reply correlated by `id`.
 *  - **event** — client → server push for monitor results, twin logs,
 *    inbound caption captures, and so on. Not correlated to any command.
 *
 * The extension consumes these shapes from `extension/commands/protocol.js`,
 * which is a hand-mirrored copy. If you change shapes here, update that
 * file too — the linker won't catch a drift.
 */

// ─── Connection lifecycle ────────────────────────────────────────────────────

export interface AuthMessage {
  type: 'auth';
  token: string | null;
  extension_id: string;
}

export interface AuthOkMessage {
  type: 'auth_ok';
}

export interface AuthFailMessage {
  type: 'auth_fail';
  reason: string;
}

export interface PingMessage {
  type: 'ping';
}

export interface PongMessage {
  type: 'pong';
}

// ─── Command / response (server → client → server) ──────────────────────────

export interface CommandMessage<P = Record<string, unknown>> {
  type: 'command';
  id: string;
  action: string;
  params?: P;
}

export interface CommandError {
  message: string;
  code?: string;
}

export interface ResponseMessage<R = unknown> {
  type: 'response';
  id: string;
  result?: R;
  error?: CommandError;
}

// ─── Event push (client → server, fire-and-forget) ──────────────────────────

export interface EventMessage<D = unknown> {
  type: 'event';
  source: string;
  eventType: string;
  data: D;
  timestamp: number;
}

// ─── Unions / constants ──────────────────────────────────────────────────────

export type ClientMessage = AuthMessage | PingMessage | ResponseMessage | EventMessage;

export type ServerMessage = AuthOkMessage | AuthFailMessage | PongMessage | CommandMessage;

export type AnyMessage = ClientMessage | ServerMessage;

export const WS_PATH = '/twin';
export const DEFAULT_WS_PORT = 9997;
export const DEFAULT_WS_HOST = '127.0.0.1';

export const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
