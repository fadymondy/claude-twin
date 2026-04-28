/**
 * WebSocket host for the MCP ↔ extension bridge.
 *
 * Hosts a single-client server on 127.0.0.1:<port>/twin. The extension's
 * offscreen document is the only expected client (a desktop user has one
 * browser, one extension, one connection at a time).
 *
 * Scope for #5: accept connection, auth handshake, ping/pong keepalive.
 * The full command bus arrives in #6 once the protocol is finalised.
 */

import { createServer, type IncomingMessage, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  DEFAULT_WS_HOST,
  DEFAULT_WS_PORT,
  WS_PATH,
  type AnyMessage,
  type ServerMessage,
} from './protocol.js';

export interface WsBridgeOptions {
  port?: number;
  host?: string;
  /**
   * Optional auth token. If provided, the extension must send the same
   * token in its `auth` message. If null/undefined, any client is accepted
   * (dev mode — sufficient for local single-user use).
   */
  token?: string | null;
}

export interface WsBridgeStatus {
  listening: boolean;
  url: string;
  connected: boolean;
  authenticated: boolean;
  extensionId: string | null;
}

const log = (msg: string): void => {
  process.stderr.write(`[claude-twin:ws] ${msg}\n`);
};

export class WsBridge {
  private readonly host: string;
  private readonly port: number;
  private readonly token: string | null;
  private httpServer: Server | null = null;
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private clientAuthenticated = false;
  private clientExtensionId: string | null = null;

  constructor(opts: WsBridgeOptions = {}) {
    this.host = opts.host ?? DEFAULT_WS_HOST;
    this.port = opts.port ?? DEFAULT_WS_PORT;
    this.token = opts.token ?? null;
  }

  status(): WsBridgeStatus {
    return {
      listening: this.httpServer?.listening ?? false,
      url: `ws://${this.host}:${this.port}${WS_PATH}`,
      connected: this.client?.readyState === 1,
      authenticated: this.clientAuthenticated,
      extensionId: this.clientExtensionId,
    };
  }

  async start(): Promise<void> {
    if (this.httpServer) return;

    this.httpServer = createServer((_req, res) => {
      res.writeHead(426, { 'Content-Type': 'text/plain' });
      res.end('Upgrade required: this endpoint speaks WebSocket on ' + WS_PATH);
    });

    this.wss = new WebSocketServer({ noServer: true });

    this.httpServer.on('upgrade', (req, socket, head) => {
      if (!this.isAllowedUpgrade(req)) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss!.handleUpgrade(req, socket, head, (ws) => this.attachClient(ws));
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error): void => reject(err);
      this.httpServer!.once('error', onError);
      this.httpServer!.listen(this.port, this.host, () => {
        this.httpServer!.off('error', onError);
        log(`listening on ws://${this.host}:${this.port}${WS_PATH}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.client && this.client.readyState <= 1) {
      this.client.close(1001, 'server shutting down');
    }
    this.client = null;
    this.clientAuthenticated = false;
    this.clientExtensionId = null;

    await new Promise<void>((resolve) => this.wss?.close(() => resolve()));
    await new Promise<void>((resolve) => {
      if (!this.httpServer) {
        resolve();
        return;
      }
      this.httpServer.close(() => resolve());
    });
    this.wss = null;
    this.httpServer = null;
  }

  private isAllowedUpgrade(req: IncomingMessage): boolean {
    if (req.url !== WS_PATH && req.url !== `${WS_PATH}/`) return false;

    const remote = (req.socket.remoteAddress ?? '') as string;
    const isLocal =
      remote === '127.0.0.1' ||
      remote === '::1' ||
      remote === '::ffff:127.0.0.1' ||
      remote.startsWith('::ffff:127.');
    if (!isLocal) {
      log(`rejected non-local connection from ${remote}`);
      return false;
    }
    return true;
  }

  private attachClient(ws: WebSocket): void {
    if (this.client && this.client.readyState <= 1) {
      log('replacing existing client connection');
      this.client.close(1000, 'superseded by new connection');
    }
    this.client = ws;
    this.clientAuthenticated = false;
    this.clientExtensionId = null;

    ws.on('message', (data) => this.handleMessage(ws, data.toString()));
    ws.on('close', (code, reason) => {
      if (this.client === ws) {
        this.client = null;
        this.clientAuthenticated = false;
        this.clientExtensionId = null;
      }
      log(`client closed (code=${code}${reason.length ? `, reason=${reason.toString()}` : ''})`);
    });
    ws.on('error', (err) => log(`client error: ${err.message}`));

    log('client connected — awaiting auth');
  }

  private handleMessage(ws: WebSocket, raw: string): void {
    let msg: AnyMessage;
    try {
      msg = JSON.parse(raw) as AnyMessage;
    } catch {
      log(`unparseable message from client: ${raw.slice(0, 120)}`);
      return;
    }

    if (msg.type === 'auth') {
      if (this.token && msg.token !== this.token) {
        this.send(ws, { type: 'auth_fail', reason: 'invalid token' });
        ws.close(4401, 'invalid token');
        return;
      }
      this.clientAuthenticated = true;
      this.clientExtensionId = msg.extension_id || null;
      this.send(ws, { type: 'auth_ok' });
      log(`auth ok (extension_id=${this.clientExtensionId ?? 'unknown'})`);
      return;
    }

    if (msg.type === 'ping') {
      this.send(ws, { type: 'pong' });
      return;
    }

    if (!this.clientAuthenticated) {
      log(`ignoring ${msg.type} before auth`);
      return;
    }

    log(`unhandled message type: ${msg.type}`);
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState !== 1) return;
    ws.send(JSON.stringify(msg));
  }
}
