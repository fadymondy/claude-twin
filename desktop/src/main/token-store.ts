/**
 * Persistent bridge auth token. Auto-generates 32 bytes of hex on first
 * launch so the WS bridge isn't open to any process on the local box.
 *
 * Storage: `<userData>/bridge-token` plain text.
 */

import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';

function tokenFile(): string {
  return join(app.getPath('userData'), 'bridge-token');
}

export async function readToken(): Promise<string | null> {
  try {
    const v = (await fs.readFile(tokenFile(), 'utf8')).trim();
    return v || null;
  } catch {
    return null;
  }
}

export async function ensureToken(): Promise<string> {
  const existing = await readToken();
  if (existing) return existing;
  const fresh = randomBytes(32).toString('hex');
  await fs.mkdir(dirname(tokenFile()), { recursive: true });
  await fs.writeFile(tokenFile(), fresh, { mode: 0o600 });
  return fresh;
}

export async function rotateToken(): Promise<string> {
  const fresh = randomBytes(32).toString('hex');
  await fs.mkdir(dirname(tokenFile()), { recursive: true });
  await fs.writeFile(tokenFile(), fresh, { mode: 0o600 });
  return fresh;
}
