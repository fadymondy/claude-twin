#!/usr/bin/env node
/**
 * claude-twin-mcp — stdio shim that connects Claude Code's MCP transport
 * to the running claude-twin desktop app over a local socket / named pipe.
 *
 * Usage:
 *   In `.mcp.json` / Claude Code plugin manifest:
 *     "claude-twin": { "command": "claude-twin-mcp" }
 *
 * Behaviour:
 *   - Resolves the per-platform socket path (must match
 *     desktop/src/shared/socket-path.ts).
 *   - Connects; pipes process.stdin → socket and socket → process.stdout.
 *   - If the socket isn't there, prints a clear actionable message to
 *     stderr and exits 1.
 *
 * Pure CJS, only depends on Node built-ins. Safe to bundle as-is in the
 * Electron release without a build step.
 */

'use strict';

const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

function socketPath() {
  if (process.platform === 'win32') {
    return '\\\\?\\pipe\\claude-twin-mcp';
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'claude-twin', 'mcp.sock');
  }
  const runtime = process.env.XDG_RUNTIME_DIR || os.tmpdir();
  return path.join(runtime, 'claude-twin', 'mcp.sock');
}

function fail(message) {
  process.stderr.write(`[claude-twin-mcp] ${message}\n`);
  process.exit(1);
}

const target = socketPath();

const socket = net.createConnection(target);

socket.on('connect', () => {
  process.stdin.pipe(socket);
  socket.pipe(process.stdout);
});

socket.on('error', (err) => {
  if (err && err.code === 'ENOENT') {
    fail(
      `cannot connect to ${target} — the claude-twin desktop app does not appear to be running.\n` +
        `Launch the claude-twin app from your Applications folder (or from your tray icon) and try again.`,
    );
  }
  if (err && err.code === 'ECONNREFUSED') {
    fail(
      `socket exists at ${target} but refused the connection. Quit and relaunch the claude-twin desktop app.`,
    );
  }
  fail(`socket error (${err && err.code ? err.code : 'unknown'}): ${err && err.message}`);
});

socket.on('close', (hadError) => {
  if (hadError) process.exit(1);
  process.exit(0);
});

process.stdin.on('end', () => {
  try {
    socket.end();
  } catch {
    /* ignore */
  }
});

const cleanShutdown = () => {
  try {
    socket.end();
  } catch {
    /* ignore */
  }
};
process.on('SIGINT', cleanShutdown);
process.on('SIGTERM', cleanShutdown);
