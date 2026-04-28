#!/usr/bin/env node
/**
 * @claude-twin/mcp-server — stdio entry point.
 *
 * Boots the MCP server, wires it to stdio transport, starts the local
 * WebSocket bridge for the Chrome extension, and handles graceful shutdown
 * on SIGINT/SIGTERM and stdin close.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, SERVER_NAME, SERVER_VERSION } from './server.js';

async function main(): Promise<void> {
  const bridgeOpts: { port?: number; host?: string; token?: string | null } = {};
  const port = parseEnvPort('CLAUDE_TWIN_WS_PORT');
  if (port !== undefined) bridgeOpts.port = port;
  if (process.env.CLAUDE_TWIN_WS_HOST) bridgeOpts.host = process.env.CLAUDE_TWIN_WS_HOST;
  if (process.env.CLAUDE_TWIN_WS_TOKEN !== undefined) {
    bridgeOpts.token = process.env.CLAUDE_TWIN_WS_TOKEN;
  }

  const { server, bridge } = createServer({ bridge: bridgeOpts });
  const transport = new StdioServerTransport();

  let shuttingDown = false;
  const shutdown = async (reason: string, code = 0): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stderr.write(`[${SERVER_NAME}] shutting down: ${reason}\n`);
    try {
      await bridge.stop();
      await server.close();
    } catch (err) {
      process.stderr.write(`[${SERVER_NAME}] close error: ${String(err)}\n`);
    }
    process.exit(code);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.stdin.on('close', () => void shutdown('stdin closed'));

  process.on('uncaughtException', (err) => {
    void shutdown(`uncaughtException: ${err.message}`, 1);
  });
  process.on('unhandledRejection', (reason) => {
    void shutdown(`unhandledRejection: ${String(reason)}`, 1);
  });

  await bridge.start();
  await server.connect(transport);
  process.stderr.write(`[${SERVER_NAME}] v${SERVER_VERSION} ready on stdio\n`);
}

function parseEnvPort(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : undefined;
}

main().catch((err) => {
  process.stderr.write(`[${SERVER_NAME}] fatal: ${String(err)}\n`);
  process.exit(1);
});
