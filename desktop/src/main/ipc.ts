/**
 * Desktop IPC bridge: forwards bridge / monitor / log events to every
 * BrowserWindow so the renderer can render them live without ever
 * touching the WS bridge directly. Also persists every event + log into
 * a sqlite db (#85), exposes Settings panel actions (#77/#78), and
 * backup/export endpoints (#90).
 */

import { BrowserWindow, dialog, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import type { WsBridge } from '@claude-twin/mcp-server/dist/bridge/ws-host.js';
import { getCliState, installCli, uninstallCli } from './cli-install.js';
import { readToken, rotateToken } from './token-store.js';
import {
  clearHistory,
  exportAll,
  importPayload,
  queryEvents,
  queryLogs,
  recordEvent,
  recordLog,
} from './event-store.js';

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
  recordLog(entry);
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
    recordEvent(snap);

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

  // Settings — CLI installer + bridge token
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

  // History — sqlite-backed, deeper than the in-memory ring buffer
  ipcMain.handle('twin/history-events', (_e, opts?: Parameters<typeof queryEvents>[0]) =>
    queryEvents(opts ?? {}),
  );
  ipcMain.handle('twin/history-logs', (_e, opts?: Parameters<typeof queryLogs>[0]) =>
    queryLogs(opts ?? {}),
  );
  ipcMain.handle('twin/history-clear', () => clearHistory());

  // Backup / export
  ipcMain.handle('twin/history-export', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Export claude-twin history',
      defaultPath: `claude-twin-history-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (result.canceled || !result.filePath) return { ok: false, canceled: true };
    try {
      const payload = exportAll();
      await fs.writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
      return {
        ok: true,
        path: result.filePath,
        events: payload.events.length,
        logs: payload.logs.length,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
  ipcMain.handle('twin/history-import', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import claude-twin history',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return { ok: false, canceled: true };
    try {
      const raw = await fs.readFile(result.filePaths[0], 'utf8');
      const payload = JSON.parse(raw);
      const counts = importPayload(payload);
      return { ok: true, ...counts };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}
