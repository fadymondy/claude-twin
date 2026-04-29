/**
 * Per-platform local socket path used by the Electron app's stdio shim.
 * The shim and the main process MUST agree on this path — keep both
 * imports in sync via this single module.
 */

import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

export function socketPath(): string {
  if (process.platform === 'win32') {
    return '\\\\?\\pipe\\claude-twin-mcp';
  }
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'claude-twin', 'mcp.sock');
  }
  // linux + other unixes
  const runtime = process.env.XDG_RUNTIME_DIR || tmpdir();
  return join(runtime, 'claude-twin', 'mcp.sock');
}
