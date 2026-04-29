/**
 * Mirror of desktop/src/main/socket-path.ts. Two copies kept manually
 * in sync — see desktop/src/main/socket-path.ts before changing.
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
  const runtime = process.env.XDG_RUNTIME_DIR || tmpdir();
  return join(runtime, 'claude-twin', 'mcp.sock');
}
