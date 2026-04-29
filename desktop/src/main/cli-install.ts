/**
 * Installs the bundled `claude-twin-mcp` shim onto the user's PATH so
 * Claude Code can invoke it without the user manually symlinking.
 *
 * Strategy per-platform:
 *  - macOS:  symlink `/usr/local/bin/claude-twin-mcp` (preferred), or
 *            `~/.local/bin/claude-twin-mcp` if /usr/local/bin isn't
 *            writable without sudo.
 *  - Linux:  symlink `~/.local/bin/claude-twin-mcp` (always user-writable).
 *  - Windows: prepend a per-user PATH entry pointing at the shim's
 *            directory. Implemented via `setx`. (Future: bundle a .cmd
 *            wrapper so users can `claude-twin-mcp` from any shell.)
 */

import { app, dialog } from 'electron';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

const FLAG_KEY = 'first-launch-cli-prompt-done';

export interface CliState {
  installed: boolean;
  target: string | null;
  source: string;
}

function shimPath(): string {
  if (app.isPackaged) {
    // electron-builder copies `shim/` into Resources/ alongside app.asar.
    return join(process.resourcesPath, 'shim', 'claude-twin-mcp.cjs');
  }
  // Dev mode — read straight from the workspace.
  return join(__dirname, '..', '..', 'shim', 'claude-twin-mcp.cjs');
}

function targetPath(): string {
  if (process.platform === 'win32') {
    // We don't drop a binary; we tell setx to append a PATH entry pointing
    // at the shim's directory. The "target" we report is informational.
    return join(process.env.APPDATA || '', 'claude-twin', 'bin', 'claude-twin-mcp.cmd');
  }
  const home = app.getPath('home');
  // Try /usr/local/bin first only if it's writable without sudo.
  return join(home, '.local', 'bin', 'claude-twin-mcp');
}

export async function getCliState(): Promise<CliState> {
  const target = targetPath();
  let installed = false;
  try {
    await fs.access(target);
    installed = true;
  } catch {
    /* not installed */
  }
  return { installed, target, source: shimPath() };
}

export async function installCli(): Promise<CliState> {
  const target = targetPath();
  const source = shimPath();
  await fs.mkdir(dirname(target), { recursive: true });

  if (process.platform === 'win32') {
    // Drop a thin .cmd that exec's node on the shim, then prepend
    // %APPDATA%\claude-twin\bin to the user PATH.
    const cmdContent = `@echo off\nnode "${source.replace(/\\/g, '\\\\')}" %*\n`;
    await fs.writeFile(target, cmdContent, 'utf8');
    await prependUserPath(dirname(target));
  } else {
    // Symlink. If a stale link exists, replace it.
    await fs.rm(target, { force: true });
    await fs.symlink(source, target, 'file');
  }
  return { installed: true, target, source };
}

export async function uninstallCli(): Promise<void> {
  const target = targetPath();
  try {
    await fs.rm(target, { force: true });
  } catch {
    /* nothing to remove */
  }
}

async function prependUserPath(dir: string): Promise<void> {
  if (process.platform !== 'win32') return;
  // Read current user PATH via reg.exe to avoid clobbering machine PATH.
  const { stdout } = await execFileP('reg', ['query', 'HKCU\\Environment', '/v', 'Path']).catch(
    () => ({ stdout: '' }),
  );
  const match = stdout.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i);
  const current = match?.[1]?.trim() ?? '';
  if (current.split(';').includes(dir)) return;
  const next = current ? `${dir};${current}` : dir;
  await execFileP('setx', ['Path', next]);
}

/**
 * Prompts the user once on first launch. Result is persisted in userData
 * so we don't ask again. Idempotent if called multiple times.
 */
export async function maybePromptFirstLaunchInstall(): Promise<void> {
  const flagFile = join(app.getPath('userData'), `${FLAG_KEY}.flag`);
  try {
    await fs.access(flagFile);
    return; // already prompted
  } catch {
    /* fall through */
  }
  await fs.mkdir(dirname(flagFile), { recursive: true });

  const state = await getCliState();
  if (state.installed) {
    await fs.writeFile(flagFile, new Date().toISOString());
    return;
  }

  const result = await dialog.showMessageBox({
    type: 'question',
    title: 'Install claude-twin command-line tool?',
    message: 'Install the `claude-twin-mcp` command-line tool?',
    detail:
      'Claude Code (and other MCP clients) need a `claude-twin-mcp` binary on your PATH to talk to claude-twin. We can install it for you at:\n\n' +
      `  ${state.target}\n\nYou can uninstall it later from the Settings page.`,
    buttons: ['Install', 'Skip for now'],
    defaultId: 0,
    cancelId: 1,
  });

  if (result.response === 0) {
    try {
      await installCli();
    } catch (err) {
      await dialog.showMessageBox({
        type: 'warning',
        title: 'CLI install failed',
        message: 'Could not install claude-twin-mcp.',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  await fs.writeFile(flagFile, new Date().toISOString());
}
