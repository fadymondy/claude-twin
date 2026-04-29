/**
 * Auto-update wiring via electron-updater.
 *
 * On launch (after the tray + window are up) we kick off an
 * `autoUpdater.checkForUpdates()`. If a newer release is found on the
 * configured GitHub Releases publish channel, we let electron-updater
 * download it in the background and prompt the user to relaunch via the
 * standard 'update-downloaded' event.
 *
 * To wire signing keys + GH_TOKEN, see `.github/workflows/release.yml`.
 */

import { autoUpdater } from 'electron-updater';
import { pushLog } from './ipc.js';

const log = (msg: string): void => {
  process.stderr.write(`[claude-twin:auto-update] ${msg}\n`);
};

export function startAutoUpdate(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => log('checking for update'));
  autoUpdater.on('update-available', (info) => {
    log(`update available: ${info.version}`);
    pushLog({
      ts: Date.now(),
      level: 'info',
      source: 'auto-update',
      message: `update available: v${info.version}`,
    });
  });
  autoUpdater.on('update-not-available', () => log('no updates'));
  autoUpdater.on('error', (err) => {
    log(`error: ${err.message}`);
    pushLog({
      ts: Date.now(),
      level: 'warn',
      source: 'auto-update',
      message: err.message,
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    log(`downloaded: ${info.version} — will install on quit`);
    pushLog({
      ts: Date.now(),
      level: 'info',
      source: 'auto-update',
      message: `v${info.version} downloaded — restart to apply`,
    });
  });

  void autoUpdater.checkForUpdates().catch((err) => {
    log(`check failed: ${err?.message ?? err}`);
  });
}
