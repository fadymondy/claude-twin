import { Tray, Menu, nativeImage, app } from 'electron';
import { join } from 'node:path';

export type TrayStatus = 'red' | 'amber' | 'green';

export interface TrayHandlers {
  onShow: () => void;
  onQuit: () => void;
}

export interface TrayApi {
  tray: Tray;
  setStatus: (status: TrayStatus) => void;
}

const STATUS_LABEL: Record<TrayStatus, string> = {
  red: 'claude-twin — bridge down',
  amber: 'claude-twin — waiting for extension',
  green: 'claude-twin — connected',
};

export function createTray(handlers: TrayHandlers): TrayApi {
  // Real templated icons land in #44. For now an empty placeholder.
  const iconPath = join(__dirname, '../../resources/tray-icon.png');
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    image = nativeImage.createEmpty();
  }

  const tray = new Tray(image);
  tray.setToolTip('claude-twin');

  let currentStatus: TrayStatus = 'red';

  const renderMenu = (): Menu =>
    Menu.buildFromTemplate([
      { label: STATUS_LABEL[currentStatus], enabled: false },
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

  tray.setContextMenu(renderMenu());

  return {
    tray,
    setStatus(status: TrayStatus) {
      currentStatus = status;
      tray.setToolTip(STATUS_LABEL[status]);
      tray.setContextMenu(renderMenu());
    },
  };
}
