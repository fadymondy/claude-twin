/**
 * Tiny MCP client over a UNIX socket / named pipe. Speaks JSON-RPC 2.0
 * with newline-delimited frames — matches what the desktop app's
 * `mcp-socket.ts` exposes.
 *
 * Why not a child-process spawn of `claude-twin-mcp`?
 *   The shim is just a stdio↔socket pipe. We connect directly to the
 *   socket so the VSCode extension doesn't have to find the shim
 *   binary in PATH (the shim assumes the desktop app is running
 *   anyway, so VSCode can do the same connectivity check itself).
 */

import * as net from 'node:net';
import { socketPath } from './socket-path';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}
interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface ToolDefinition {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, { type?: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

export type McpClientStatus = 'disconnected' | 'connecting' | 'ready' | 'error';

export class McpClient {
  private sock: net.Socket | null = null;
  private buf = '';
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (err: Error) => void }
  >();
  private statusListeners = new Set<(s: McpClientStatus, msg?: string) => void>();
  private currentStatus: McpClientStatus = 'disconnected';

  constructor(private readonly log: (m: string) => void) {}

  onStatus(handler: (s: McpClientStatus, msg?: string) => void): () => void {
    this.statusListeners.add(handler);
    handler(this.currentStatus);
    return () => this.statusListeners.delete(handler);
  }

  status(): McpClientStatus {
    return this.currentStatus;
  }

  async connect(): Promise<void> {
    if (this.sock) return;
    const target = socketPath();
    this.setStatus('connecting');

    await new Promise<void>((resolve, reject) => {
      const sock = net.createConnection(target);
      const onError = (err: NodeJS.ErrnoException): void => {
        sock.removeListener('connect', onConnect);
        if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
          reject(
            new Error(
              `claude-twin desktop app is not running. Launch it (Applications → claude-twin) and try again.`,
            ),
          );
          return;
        }
        reject(err);
      };
      const onConnect = (): void => {
        sock.removeListener('error', onError);
        this.sock = sock;
        this.attach(sock);
        resolve();
      };
      sock.once('error', onError);
      sock.once('connect', onConnect);
    });

    await this.initialize();
    this.setStatus('ready');
  }

  disconnect(): void {
    if (!this.sock) return;
    try {
      this.sock.end();
    } catch {
      /* ignore */
    }
    this.sock = null;
    this.setStatus('disconnected');
    this.failAllPending('disconnected');
  }

  async listTools(): Promise<ToolDefinition[]> {
    const result = (await this.request('tools/list', {})) as { tools: ToolDefinition[] };
    return result.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    return this.request('tools/call', { name, arguments: args });
  }

  private async initialize(): Promise<void> {
    await this.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'claude-twin-vscode', version: '0.1.0' },
    });
    this.notify('notifications/initialized');
  }

  private attach(sock: net.Socket): void {
    sock.setEncoding('utf8');
    sock.on('data', (chunk: string) => {
      this.buf += chunk;
      let nl: number;
      while ((nl = this.buf.indexOf('\n')) !== -1) {
        const line = this.buf.slice(0, nl).trim();
        this.buf = this.buf.slice(nl + 1);
        if (line) this.handleLine(line);
      }
    });
    sock.on('close', () => {
      this.log('socket closed');
      this.sock = null;
      this.setStatus('disconnected');
      this.failAllPending('socket closed');
    });
    sock.on('error', (err) => {
      this.log(`socket error: ${err.message}`);
      this.setStatus('error', err.message);
    });
  }

  private handleLine(line: string): void {
    let msg: JsonRpcResponse;
    try {
      msg = JSON.parse(line);
    } catch {
      this.log(`unparseable: ${line.slice(0, 200)}`);
      return;
    }
    const pend = this.pending.get(msg.id);
    if (!pend) return;
    this.pending.delete(msg.id);
    if (msg.error) {
      pend.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
    } else {
      pend.resolve(msg.result);
    }
  }

  private request(method: string, params: unknown): Promise<unknown> {
    if (!this.sock) return Promise.reject(new Error('not connected'));
    const id = this.nextId++;
    const req: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.sock!.write(JSON.stringify(req) + '\n');
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`timed out: ${method}`));
      }, 30_000);
    });
  }

  private notify(method: string): void {
    if (!this.sock) return;
    this.sock.write(JSON.stringify({ jsonrpc: '2.0', method }) + '\n');
  }

  private failAllPending(reason: string): void {
    for (const [, p] of this.pending) {
      p.reject(new Error(reason));
    }
    this.pending.clear();
  }

  private setStatus(status: McpClientStatus, msg?: string): void {
    this.currentStatus = status;
    for (const h of this.statusListeners) h(status, msg);
  }
}
