/**
 * Persistent event store. Writes every twin event + log to a sqlite db
 * in `<userData>/events.sqlite` so the renderer can show history past
 * the in-memory ring buffer.
 *
 * Tables:
 *   events  (id integer pk, ts integer, source text, event_type text, data text)
 *   logs    (id integer pk, ts integer, level text, source text, message text)
 *
 * Both are append-only. Older rows are pruned on a daily VACUUM hook
 * keyed off `keepDays` (default 30). The Settings panel's "Clear history"
 * + "Export…" / "Import…" actions hit this module via IPC.
 */

import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { TwinEventSnapshot, TwinLogEntry } from './ipc.js';

let db: Database.Database | null = null;
let insertEventStmt: Database.Statement | null = null;
let insertLogStmt: Database.Statement | null = null;
let dbErrorLogged = false;

function open(): Database.Database | null {
  if (db) return db;
  try {
    const dir = app.getPath('userData');
    mkdirSync(dir, { recursive: true });
    db = new Database(join(dir, 'events.sqlite'));
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        source TEXT NOT NULL,
        event_type TEXT NOT NULL,
        data TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
      CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);

      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        level TEXT NOT NULL,
        source TEXT NOT NULL,
        message TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts);
    `);
    insertEventStmt = db.prepare(
      'INSERT INTO events (ts, source, event_type, data) VALUES (?, ?, ?, ?)',
    );
    insertLogStmt = db.prepare('INSERT INTO logs (ts, level, source, message) VALUES (?, ?, ?, ?)');
    return db;
  } catch (err) {
    if (!dbErrorLogged) {
      process.stderr.write(
        `[claude-twin:event-store] sqlite unavailable: ${err instanceof Error ? err.message : String(err)} — history persistence disabled\n`,
      );
      dbErrorLogged = true;
    }
    return null;
  }
}

export function recordEvent(snap: TwinEventSnapshot): void {
  const handle = open();
  if (!handle || !insertEventStmt) return;
  try {
    insertEventStmt.run(snap.timestamp, snap.source, snap.eventType, JSON.stringify(snap.data));
  } catch {
    /* swallow — we never want to crash main on a write */
  }
}

export function recordLog(entry: TwinLogEntry): void {
  const handle = open();
  if (!handle || !insertLogStmt) return;
  try {
    insertLogStmt.run(entry.ts, entry.level, entry.source, entry.message);
  } catch {
    /* swallow */
  }
}

export interface EventQuery {
  source?: string;
  since?: number;
  until?: number;
  limit?: number;
}

export function queryEvents(opts: EventQuery = {}): TwinEventSnapshot[] {
  const handle = open();
  if (!handle) return [];
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.source) {
    where.push('source = ?');
    params.push(opts.source);
  }
  if (opts.since !== undefined) {
    where.push('ts >= ?');
    params.push(opts.since);
  }
  if (opts.until !== undefined) {
    where.push('ts <= ?');
    params.push(opts.until);
  }
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 5000);
  const sql = `SELECT ts, source, event_type, data FROM events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ts DESC LIMIT ?`;
  params.push(limit);
  const rows = handle.prepare(sql).all(...params) as {
    ts: number;
    source: string;
    event_type: string;
    data: string;
  }[];
  return rows.map((r) => ({
    timestamp: r.ts,
    source: r.source,
    eventType: r.event_type,
    data: safeParse(r.data),
  }));
}

export function queryLogs(
  opts: { level?: string; since?: number; limit?: number } = {},
): TwinLogEntry[] {
  const handle = open();
  if (!handle) return [];
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.level) {
    where.push('level = ?');
    params.push(opts.level);
  }
  if (opts.since !== undefined) {
    where.push('ts >= ?');
    params.push(opts.since);
  }
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 5000);
  const sql = `SELECT ts, level, source, message FROM logs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ts DESC LIMIT ?`;
  params.push(limit);
  const rows = handle.prepare(sql).all(...params) as {
    ts: number;
    level: string;
    source: string;
    message: string;
  }[];
  return rows.map((r) => ({
    ts: r.ts,
    level: r.level as TwinLogEntry['level'],
    source: r.source,
    message: r.message,
  }));
}

export function clearHistory(): { events: number; logs: number } {
  const handle = open();
  if (!handle) return { events: 0, logs: 0 };
  const events = handle.prepare('DELETE FROM events').run().changes;
  const logs = handle.prepare('DELETE FROM logs').run().changes;
  handle.exec('VACUUM');
  return { events, logs };
}

export interface ExportPayload {
  schema: 'claude-twin/events';
  version: 1;
  exportedAt: number;
  events: TwinEventSnapshot[];
  logs: TwinLogEntry[];
}

export function exportAll(): ExportPayload {
  return {
    schema: 'claude-twin/events',
    version: 1,
    exportedAt: Date.now(),
    events: queryEvents({ limit: 5000 }),
    logs: queryLogs({ limit: 5000 }),
  };
}

export function importPayload(payload: unknown): { events: number; logs: number } {
  const handle = open();
  if (!handle || !insertEventStmt || !insertLogStmt) return { events: 0, logs: 0 };
  if (!payload || typeof payload !== 'object') {
    throw new Error('invalid payload');
  }
  const p = payload as Partial<ExportPayload>;
  if (p.schema !== 'claude-twin/events' || p.version !== 1) {
    throw new Error('unsupported schema or version');
  }
  let events = 0;
  let logs = 0;
  const tx = handle.transaction(() => {
    for (const e of p.events ?? []) {
      insertEventStmt!.run(e.timestamp, e.source, e.eventType, JSON.stringify(e.data));
      events += 1;
    }
    for (const l of p.logs ?? []) {
      insertLogStmt!.run(l.ts, l.level, l.source, l.message);
      logs += 1;
    }
  });
  tx();
  return { events, logs };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

export function close(): void {
  try {
    db?.close();
  } catch {
    /* ignore */
  }
  db = null;
  insertEventStmt = null;
  insertLogStmt = null;
}
