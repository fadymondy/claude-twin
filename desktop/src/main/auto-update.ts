/**
 * Auto-update wiring via electron-updater.
 *
 * - On launch (when packaged) we kick off `autoUpdater.checkForUpdates()`.
 * - The tray's "Check for updates…" menu item triggers `manualCheck()`
 *   which surfaces the result in a native dialog and updates the tray.
 *
 * Signing keys + GH_TOKEN: see `.github/workflows/release.yml`.
 */

import { autoUpdater, type UpdateInfo } from 'electron-updater';
import { pushLog } from './ipc.js';
import { showUpdateResult } from './tray.js';

type Subscriber = (s: { available: string | null; checking?: boolean }) => void;

let lastAvailable: string | null = null;
let subscriber: Subscriber | null = null;

const log = (msg: string): void => {
  process.stderr.write(`[claude-twin:auto-update] ${msg}\n`);
};

export function startAutoUpdate(setTrayUpdate: Subscriber): void {
  subscriber = setTrayUpdate;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    log('checking for update');
    subscriber?.({ available: lastAvailable, checking: true });
  });
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log(`update available: ${info.version}`);
    lastAvailable = info.version;
    subscriber?.({ available: info.version, checking: false });
    pushLog({
      ts: Date.now(),
      level: 'info',
      source: 'auto-update',
      message: `update available: v${info.version}`,
    });
  });
  autoUpdater.on('update-not-available', () => {
    log('no updates');
    subscriber?.({ available: null, checking: false });
  });
  autoUpdater.on('error', (err) => {
    log(`error: ${err.message}`);
    subscriber?.({ available: lastAvailable, checking: false });
    pushLog({
      ts: Date.now(),
      level: 'warn',
      source: 'auto-update',
      message: err.message,
    });
  });
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log(`downloaded: ${info.version} — will install on quit`);
    lastAvailable = info.version;
    subscriber?.({ available: info.version, checking: false });
    pushLog({
      ts: Date.now(),
      level: 'info',
      source: 'auto-update',
      message: `v${info.version} downloaded — restart to apply`,
    });
  });

  void autoUpdater.checkForUpdates().catch((err) => {
    log(`initial check failed: ${err?.message ?? err}`);
  });
}

/**
 * Triggered from the tray menu. Surfaces the result in a native dialog
 * (so the user gets immediate feedback), in addition to the standard
 * autoUpdater event flow.
 */
export async function manualCheckForUpdates(): Promise<void> {
  subscriber?.({ available: lastAvailable, checking: true });
  try {
    const result = await autoUpdater.checkForUpdates();
    if (!result?.updateInfo) {
      await showUpdateResult('up-to-date');
      subscriber?.({ available: null, checking: false });
      return;
    }
    const installed = autoUpdater.currentVersion?.version ?? '0.0.0';
    if (result.updateInfo.version === installed) {
      await showUpdateResult('up-to-date');
      subscriber?.({ available: null, checking: false });
    } else {
      await showUpdateResult(
        'available',
        `v${result.updateInfo.version} will install when you quit claude-twin.`,
      );
      subscriber?.({ available: result.updateInfo.version, checking: false });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await showUpdateResult('error', message);
    subscriber?.({ available: lastAvailable, checking: false });
  }
}
