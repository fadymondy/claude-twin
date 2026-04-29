/**
 * Desktop IPC bridge: forwards bridge / monitor / log events to every
 * BrowserWindow so the renderer can render them live without ever
 * touching the WS bridge directly.
 *
 * Channels (renderer ← main):
 *   twin/bridge-status    { listening, connected, authenticated, extensionId, url, pendingCommands }
 *   twin/event            { source, eventType, data, timestamp }
 *   twin/log              { ts, level, source, message }
 *
 * Channels (renderer → main, ipcRenderer.invoke):
 *   twin/get-status       → current bridge status snapshot
 *   twin/get-recent-events { limit? } → ring buffer
 *   twin/get-recent-logs   { limit? } → ring buffer
 */

import { BrowserWindow, ipcMain } from 'electron';
import type { WsBridge } from '@claude-twin/mcp-server/dist/bridge/ws-host.js';
import { getCliState, installCli, uninstallCli } from './cli-install.js';
import { readToken, rotateToken } from './token-store.js';

export interface TwinLogEntry {
  ts: number;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
}

export interface TwinEventSnapshot {
  source: string;
  eventType: string;
  data: unknown;
  timestamp: number;
}

const RING = 500;

const recentEvents: TwinEventSnapshot[] = [];
const recentLogs: TwinLogEntry[] = [];

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

export function pushLog(entry: TwinLogEntry): void {
  recentLogs.push(entry);
  while (recentLogs.length > RING) recentLogs.shift();
  broadcast('twin/log', entry);
}

export function attachIpc(bridge: WsBridge): void {
  bridge.onEvent((evt) => {
    const snap: TwinEventSnapshot = {
      source: evt.source,
      eventType: evt.eventType,
      data: evt.data,
      timestamp: evt.timestamp,
    };
    recentEvents.push(snap);
    while (recentEvents.length > RING) recentEvents.shift();
    broadcast('twin/event', snap);

    pushLog({
      ts: evt.timestamp || Date.now(),
      level: 'info',
      source: evt.source,
      message: `event ${evt.eventType}`,
    });
  });

  bridge.on('ready', ({ extensionId }: { extensionId: string | null }) => {
    pushLog({
      ts: Date.now(),
      level: 'info',
      source: 'bridge',
      message: `extension authenticated (id=${extensionId ?? 'unknown'})`,
    });
    broadcast('twin/bridge-status', bridge.status());
  });

  // Periodic status broadcast so the renderer's connection light stays fresh.
  setInterval(() => broadcast('twin/bridge-status', bridge.status()), 2_000);

  ipcMain.handle('twin/get-status', () => bridge.status());
  ipcMain.handle('twin/get-recent-events', (_e, opts?: { limit?: number }) => {
    const limit = Math.min(Math.max(opts?.limit ?? 100, 1), RING);
    return recentEvents.slice(-limit);
  });
  ipcMain.handle('twin/get-recent-logs', (_e, opts?: { limit?: number }) => {
    const limit = Math.min(Math.max(opts?.limit ?? 100, 1), RING);
    return recentLogs.slice(-limit);
  });

  // Settings panel
  ipcMain.handle('twin/cli-state', () => getCliState());
  ipcMain.handle('twin/cli-install', async () => {
    try {
      return { ok: true, state: await installCli() };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  ipcMain.handle('twin/cli-uninstall', async () => {
    try {
      await uninstallCli();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  ipcMain.handle('twin/get-token', () => readToken());
  ipcMain.handle('twin/rotate-token', async () => rotateToken());
}
