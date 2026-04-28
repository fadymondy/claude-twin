/**
 * Wire protocol shared between the MCP server's WebSocket bridge and the
 * Chrome extension's offscreen document. The full request/response/event
 * envelope set is finalised in #6 — this module currently covers what #5
 * needs (auth handshake + keepalive).
 */

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

export type ClientMessage = AuthMessage | PingMessage;
export type ServerMessage = AuthOkMessage | AuthFailMessage | PongMessage;
export type AnyMessage = ClientMessage | ServerMessage;

export const WS_PATH = '/twin';
export const DEFAULT_WS_PORT = 9997;
export const DEFAULT_WS_HOST = '127.0.0.1';
