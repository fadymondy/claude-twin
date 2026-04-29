import { Tray, Menu, nativeImage, app, type NativeImage } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type TrayStatus = 'red' | 'amber' | 'green';

export interface TrayHandlers {
  onShow: () => void;
  onQuit: () => void;
  onOpenSettings?: () => void;
}

export interface TrayApi {
  tray: Tray;
  setStatus: (status: TrayStatus) => void;
}

const STATUS_LABEL: Record<TrayStatus, string> = {
  red: '● claude-twin — bridge down',
  amber: '● claude-twin — waiting for extension',
  green: '● claude-twin — connected',
};

/**
 * Loads the per-status tray icon. Real PNG assets land in #46 (release
 * pipeline ships colour + template variants). Until then we look in
 * `resources/` and fall back to an empty image when assets are absent —
 * the colour-coded leading dot in the menu's first item plus the tooltip
 * carry the status visually.
 */
function loadIcon(status: TrayStatus): NativeImage {
  const candidates = [
    join(__dirname, `../../resources/tray-${status}.png`),
    join(__dirname, '../../resources/tray-icon.png'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const img = nativeImage.createFromPath(path);
    if (!img.isEmpty()) {
      // Treat the default tray-icon.png as a template image on macOS so
      // it auto-adapts to dark / light menubar colours.
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

  const renderMenu = (): Menu =>
    Menu.buildFromTemplate([
      { label: STATUS_LABEL[currentStatus], enabled: false },
      { type: 'separator' },
      { label: 'Show details', click: handlers.onShow },
      {
        label: 'Settings…',
        click: () => handlers.onOpenSettings?.(),
      },
      {
        label: 'Auto-launch on login',
        type: 'checkbox',
        checked: getOpenAtLogin(),
        click: (item) => {
          app.setLoginItemSettings?.({
            openAtLogin: item.checked,
            // On macOS, open hidden so we go straight to the tray.
            openAsHidden: process.platform === 'darwin',
          });
        },
      },
      { type: 'separator' },
      { label: 'Quit claude-twin', accelerator: 'CmdOrCtrl+Q', click: handlers.onQuit },
    ]);

  tray.setContextMenu(renderMenu());

  return {
    tray,
    setStatus(status: TrayStatus) {
      currentStatus = status;
      tray.setToolTip(STATUS_LABEL[status].replace('● ', ''));
      tray.setImage(loadIcon(status));
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
