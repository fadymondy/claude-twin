/**
 * Hosts a local socket (UNIX socket on macOS / Linux, named pipe on
 * Windows). Each incoming connection is treated as a fresh stdio MCP
 * session: a new `McpServer` is created (sharing the desktop's
 * `WsBridge`) and `StdioServerTransport` is wired with the socket as
 * both stdin and stdout.
 *
 * The Claude Code plugin's `claude-twin-mcp` shim connects to this
 * socket and pipes its own stdin/stdout through.
 *
 * Both `@modelcontextprotocol/sdk` and `@claude-twin/mcp-server` are
 * `"type":"module"` ESM, so we dynamic-import them inside `startMcpSocketHost`
 * — Electron main is CJS and CJS can't statically import ESM.
 */

import { createServer as createNetServer, type Server as NetServer } from 'node:net';
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { WsBridge } from '@claude-twin/mcp-server/dist/bridge/ws-host.js';
import { socketPath } from './socket-path.js';

export interface McpSocketHost {
  /** Resolved path the server is listening on. */
  path: string;
  stop: () => Promise<void>;
}

const log = (msg: string): void => {
  process.stderr.write(`[claude-twin:mcp-socket] ${msg}\n`);
};

export async function startMcpSocketHost(bridge: WsBridge): Promise<McpSocketHost> {
  const [{ createMcpServer }, { StdioServerTransport }] = await Promise.all([
    import('@claude-twin/mcp-server/dist/server.js'),
    import('@modelcontextprotocol/sdk/server/stdio.js'),
  ]);

  const path = socketPath();

  // Ensure parent directory exists (mac/linux). Windows named pipes don't need this.
  if (process.platform !== 'win32') {
    await mkdir(dirname(path), { recursive: true });
    await rm(path, { force: true }).catch(() => undefined);
    try {
      await stat(path);
      await rm(path, { force: true });
    } catch {
      // Not present — fine.
    }
  }

  const server: NetServer = createNetServer((socket) => {
    const peer = `${socket.remoteAddress ?? 'local'}:${socket.remotePort ?? 0}`;
    log(`mcp shim connected (${peer})`);

    const mcp = createMcpServer(bridge);
    const transport = new StdioServerTransport(socket, socket);

    socket.on('error', (err) => log(`mcp shim error: ${err.message}`));
    socket.on('close', () => {
      log('mcp shim disconnected');
      void mcp.close().catch(() => undefined);
    });

    void mcp.connect(transport).catch((err) => {
      log(`mcp connect failed: ${err?.message ?? String(err)}`);
      socket.destroy();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(path, () => {
      server.off('error', reject);
      log(`listening on ${path}`);
      resolve();
    });
  });

  return {
    path,
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
