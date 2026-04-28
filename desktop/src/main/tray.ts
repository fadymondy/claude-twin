import { Tray, Menu, nativeImage, app } from 'electron';
import { join } from 'node:path';

export interface TrayHandlers {
  onShow: () => void;
  onQuit: () => void;
}

export function createTray(handlers: TrayHandlers): Tray {
  // Real templated icons land in #44. For the scaffold we use an empty
  // 1×1 transparent image — Electron still places the tray in the menubar
  // with the app name as fallback.
  const iconPath = join(__dirname, '../../resources/tray-icon.png');
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    image = nativeImage.createEmpty();
  }

  const tray = new Tray(image);
  tray.setToolTip('claude-twin');

  const menu = Menu.buildFromTemplate([
    {
      label: 'claude-twin',
      enabled: false,
    },
    { type: 'separator' },
    { label: 'Show details', click: handlers.onShow },
    {
      label: 'Auto-launch on login',
      type: 'checkbox',
      checked: app.getLoginItemSettings?.()?.openAtLogin ?? false,
      click: (item) => {
        app.setLoginItemSettings?.({ openAtLogin: item.checked });
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: handlers.onQuit },
  ]);

  tray.setContextMenu(menu);
  return tray;
}
