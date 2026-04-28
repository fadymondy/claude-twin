/**
 * claude-twin desktop — Electron main process entry.
 *
 * For #41 (scaffold) this:
 *   - boots a single hidden BrowserWindow that loads the React renderer
 *   - registers the system tray with Show / Quit menu items
 *   - hides the dock icon on macOS so we live in the menubar by default
 *
 * The WS-bridge embedding (#42) and stdio shim socket (#43) land later.
 */

import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { createTray } from './tray.js';

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 920,
    height: 640,
    show: false, // tray-first; user clicks "Show details" to reveal
    title: 'claude-twin',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.on('close', (e) => {
    // Tray-first: closing the window only hides it. Real quit is via tray menu.
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  mainWindow = createWindow();

  createTray({
    onShow: () => {
      if (!mainWindow) mainWindow = createWindow();
      mainWindow.show();
      mainWindow.focus();
    },
    onQuit: () => {
      app.isQuitting = true;
      app.quit();
    },
  });
});

app.on('window-all-closed', () => {
  // Tray keeps the app alive on every platform.
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('activate', () => {
  if (!mainWindow) mainWindow = createWindow();
  mainWindow.show();
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Electron {
    interface App {
      isQuitting?: boolean;
    }
  }
}
