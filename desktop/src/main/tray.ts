import { Tray, Menu, nativeImage, app, dialog, type NativeImage } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type TrayStatus = 'red' | 'amber' | 'green';

export interface TrayHandlers {
  onShow: () => void;
  onQuit: () => void;
  onOpenSettings?: () => void;
  onCheckForUpdates?: () => Promise<void> | void;
}

export interface TrayApi {
  tray: Tray;
  setStatus: (status: TrayStatus) => void;
  setUpdateState: (s: { available: string | null; checking?: boolean }) => void;
}

const STATUS_LABEL: Record<TrayStatus, string> = {
  red: '● claude-twin — bridge down',
  amber: '● claude-twin — waiting for extension',
  green: '● claude-twin — connected',
};

/**
 * Loads the per-status tray icon. The default `tray-icon.png` is a
 * monochrome template (auto-adapts to dark/light menubar on macOS).
 * Status-specific colour variants are used on Windows / Linux where
 * template images aren't a thing; on macOS we keep the template and
 * communicate status via the menu's leading colour-coded dot.
 */
function loadIcon(status: TrayStatus): NativeImage {
  const candidates =
    process.platform === 'darwin'
      ? [join(__dirname, '../../resources/tray-icon.png')]
      : [
          join(__dirname, `../../resources/tray-${status}.png`),
          join(__dirname, '../../resources/tray-icon.png'),
        ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const img = nativeImage.createFromPath(path);
    if (!img.isEmpty()) {
      if (process.platform === 'darwin' && path.endsWith('tray-icon.png')) {
        img.setTemplateImage(true);
      }
      return img;
    }
  }
  return nativeImage.createEmpty();
}

export function createTray(handlers: TrayHandlers): TrayApi {
  const tray = new Tray(loadIcon('red'));
  tray.setToolTip('claude-twin');

  let currentStatus: TrayStatus = 'red';
  let updateAvailable: string | null = null;
  let checkingForUpdates = false;

  const renderMenu = (): Menu =>
    Menu.buildFromTemplate([
      { label: STATUS_LABEL[currentStatus], enabled: false },
      { type: 'separator' },
      { label: 'Show details', click: handlers.onShow },
      { label: 'Settings…', click: () => handlers.onOpenSettings?.() },
      {
        label: 'Auto-launch on login',
        type: 'checkbox',
        checked: getOpenAtLogin(),
        click: (item) => {
          app.setLoginItemSettings?.({
            openAtLogin: item.checked,
            openAsHidden: process.platform === 'darwin',
          });
        },
      },
      { type: 'separator' },
      ...(updateAvailable
        ? [
            {
              label: `Update v${updateAvailable} available — install on quit`,
              enabled: false,
            },
            { type: 'separator' as const },
          ]
        : []),
      {
        label: checkingForUpdates ? 'Checking for updates…' : 'Check for updates…',
        enabled: !checkingForUpdates,
        click: () => void handlers.onCheckForUpdates?.(),
      },
      { type: 'separator' },
      { label: 'Quit claude-twin', accelerator: 'CmdOrCtrl+Q', click: handlers.onQuit },
    ]);

  tray.setContextMenu(renderMenu());

  // Single-click on the tray icon should reveal the window. On macOS the
  // context menu opens on right-click and 'click' fires on left-click.
  tray.on('click', () => handlers.onShow());

  return {
    tray,
    setStatus(status: TrayStatus) {
      currentStatus = status;
      tray.setToolTip(STATUS_LABEL[status].replace('● ', ''));
      tray.setImage(loadIcon(status));
      tray.setContextMenu(renderMenu());
    },
    setUpdateState({ available, checking }) {
      updateAvailable = available;
      checkingForUpdates = !!checking;
      tray.setContextMenu(renderMenu());
    },
  };
}

function getOpenAtLogin(): boolean {
  try {
    return app.getLoginItemSettings?.()?.openAtLogin ?? false;
  } catch {
    return false;
  }
}

export async function showUpdateResult(
  status: 'up-to-date' | 'available' | 'error',
  detail?: string,
): Promise<void> {
  const messages: Record<typeof status, { title: string; message: string }> = {
    'up-to-date': {
      title: 'claude-twin is up to date',
      message: 'You’re running the latest version.',
    },
    available: {
      title: 'Update available',
      message: detail ?? 'A new version was downloaded and will install on quit.',
    },
    error: {
      title: 'Update check failed',
      message: detail ?? 'Could not reach the update server.',
    },
  };
  await dialog.showMessageBox({
    type: status === 'error' ? 'warning' : 'info',
    title: messages[status].title,
    message: messages[status].message,
  });
}
