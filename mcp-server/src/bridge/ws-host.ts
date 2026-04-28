/**
 * WebSocket host for the MCP ↔ extension bridge.
 *
 * Hosts a single-client server on 127.0.0.1:<port>/twin. The extension's
 * offscreen document is the only expected client (a desktop user has one
 * browser, one extension, one connection at a time).
 *
 * Beyond the auth handshake from #5, this module implements the full
 * command bus from #6:
 *  - `sendCommand(action, params)` — request/response RPC, server → client,
 *    correlated by a generated id, defaults to a 30s timeout.
 *  - `onEvent(handler)` — subscribe to client → server pushes (monitor
 *    results, twin logs, captions). Returns an unsubscribe fn.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  DEFAULT_COMMAND_TIMEOUT_MS,
  DEFAULT_WS_HOST,
  DEFAULT_WS_PORT,
  WS_PATH,
  type AnyMessage,
  type CommandError,
  type CommandMessage,
  type EventMessage,
  type ResponseMessage,
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
  /** Default command timeout in ms (override per-call via sendCommand opts). */
  defaultCommandTimeoutMs?: number;
}

export interface WsBridgeStatus {
  listening: boolean;
  url: string;
  connected: boolean;
  authenticated: boolean;
  extensionId: string | null;
  pendingCommands: number;
}

export interface SendCommandOptions {
  /** Override the default timeout for this single call. */
  timeoutMs?: number;
}

export class CommandTimeoutError extends Error {
  constructor(
    public readonly action: string,
    public readonly id: string,
    public readonly timeoutMs: number,
  ) {
    super(`Command "${action}" (id=${id}) timed out after ${timeoutMs}ms`);
    this.name = 'CommandTimeoutError';
  }
}

export class CommandFailedError extends Error {
  constructor(
    public readonly action: string,
    public readonly id: string,
    public readonly cause: CommandError,
  ) {
    super(`Command "${action}" (id=${id}) failed: ${cause.message}`);
    this.name = 'CommandFailedError';
  }
}

export class BridgeNotConnectedError extends Error {
  constructor(public readonly action: string) {
    super(`Cannot send "${action}": no extension connected to the bridge`);
    this.name = 'BridgeNotConnectedError';
  }
}

interface PendingCommand {
  action: string;
  resolve: (result: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

const log = (msg: string): void => {
  process.stderr.write(`[claude-twin:ws] ${msg}\n`);
};

export class WsBridge extends EventEmitter {
  private readonly host: string;
  private readonly port: number;
  private readonly token: string | null;
  private readonly defaultCommandTimeoutMs: number;

  private httpServer: Server | null = null;
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private clientAuthenticated = false;
  private clientExtensionId: string | null = null;

  private readonly pending = new Map<string, PendingCommand>();

  constructor(opts: WsBridgeOptions = {}) {
    super();
    this.host = opts.host ?? DEFAULT_WS_HOST;
    this.port = opts.port ?? DEFAULT_WS_PORT;
    this.token = opts.token ?? null;
    this.defaultCommandTimeoutMs = opts.defaultCommandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  }

  status(): WsBridgeStatus {
    return {
      listening: this.httpServer?.listening ?? false,
      url: `ws://${this.host}:${this.port}${WS_PATH}`,
      connected: this.client?.readyState === 1,
      authenticated: this.clientAuthenticated,
      extensionId: this.clientExtensionId,
      pendingCommands: this.pending.size,
    };
  }

  isReady(): boolean {
    return this.client?.readyState === 1 && this.clientAuthenticated;
  }

  /**
   * Send a command to the connected extension and resolve with the result.
   *
   * Rejects with:
   *  - `BridgeNotConnectedError` if no client is connected.
   *  - `CommandTimeoutError` if no response arrives in time.
   *  - `CommandFailedError` if the extension returns `{ error: ... }`.
   */
  sendCommand<R = unknown>(
    action: string,
    params: Record<string, unknown> = {},
    opts: SendCommandOptions = {},
  ): Promise<R> {
    if (!this.isReady() || !this.client) {
      return Promise.reject(new BridgeNotConnectedError(action));
    }

    const id = randomUUID();
    const timeoutMs = opts.timeoutMs ?? this.defaultCommandTimeoutMs;

    return new Promise<R>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new CommandTimeoutError(action, id, timeoutMs));
        }
      }, timeoutMs);

      this.pending.set(id, {
        action,
        resolve: resolve as (result: unknown) => void,
        reject,
        timer,
      });

      const cmd: CommandMessage = { type: 'command', id, action, params };
      try {
        this.client!.send(JSON.stringify(cmd));
      } catch (err) {
        if (this.pending.delete(id)) {
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }
    });
  }

  /**
   * Subscribe to inbound `event` messages from the extension. Returns an
   * unsubscribe function. The handler is called with the full event message
   * (`source`, `eventType`, `data`, `timestamp`).
   */
  onEvent(handler: (msg: EventMessage) => void): () => void {
    this.on('event', handler);
    return () => this.off('event', handler);
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
    this.failAllPending('bridge stopping');

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
    this.failAllPending('client reconnected before response');

    ws.on('message', (data) => this.handleMessage(ws, data.toString()));
    ws.on('close', (code, reason) => {
      if (this.client === ws) {
        this.client = null;
        this.clientAuthenticated = false;
        this.clientExtensionId = null;
        this.failAllPending('client disconnected');
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
      this.emit('ready', { extensionId: this.clientExtensionId });
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

    if (msg.type === 'response') {
      this.completePending(msg);
      return;
    }

    if (msg.type === 'event') {
      this.emit('event', msg as EventMessage);
      return;
    }

    log(`unhandled message type: ${(msg as { type: string }).type}`);
  }

  private completePending(msg: ResponseMessage): void {
    const pending = this.pending.get(msg.id);
    if (!pending) {
      log(`response for unknown id=${msg.id}`);
      return;
    }
    this.pending.delete(msg.id);
    clearTimeout(pending.timer);

    if (msg.error) {
      pending.reject(new CommandFailedError(pending.action, msg.id, msg.error));
    } else {
      pending.resolve(msg.result);
    }
  }

  private failAllPending(reason: string): void {
    if (this.pending.size === 0) return;
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new BridgeNotConnectedError(`${p.action} (${reason}, id=${id})`));
    }
    this.pending.clear();
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState !== 1) return;
    ws.send(JSON.stringify(msg));
  }
}
