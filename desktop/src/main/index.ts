/**
 * claude-twin desktop — Electron main process entry.
 *
 *   - boots a single hidden BrowserWindow that loads the React renderer
 *   - registers the system tray (3-state status colour: red/amber/green)
 *   - embeds the @claude-twin/mcp-server WsBridge directly so the user
 *     doesn't need a separate Node install
 *   - hides the dock icon on macOS so we live in the menubar by default
 *
 * mcp-server is `"type":"module"` ESM. Electron's main process here is CJS,
 * so we pull in WsBridge via an `await import(...)` inside the async
 * whenReady handler — Node CJS can dynamic-import ESM, just not statically.
 */

import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import type { WsBridge as WsBridgeT } from '@claude-twin/mcp-server/dist/bridge/ws-host.js';
import { createTray, type TrayApi } from './tray.js';
import { startMcpSocketHost, type McpSocketHost } from './mcp-socket.js';
import { attachIpc, pushLog } from './ipc.js';
import { startAutoUpdate } from './auto-update.js';

let mainWindow: BrowserWindow | null = null;
let bridge: WsBridgeT | null = null;
let trayApi: TrayApi | null = null;
let mcpSocket: McpSocketHost | null = null;

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

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  mainWindow = createWindow();

  trayApi = createTray({
    onShow: () => {
      if (!mainWindow) mainWindow = createWindow();
      mainWindow.show();
      mainWindow.focus();
    },
    onOpenSettings: () => {
      if (!mainWindow) mainWindow = createWindow();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('navigate', '/settings');
    },
    onQuit: () => {
      app.isQuitting = true;
      app.quit();
    },
  });

  const { WsBridge } = await import('@claude-twin/mcp-server/dist/bridge/ws-host.js');
  bridge = new WsBridge({
    token: process.env.CLAUDE_TWIN_WS_TOKEN ?? null,
  });

  bridge.on('ready', () => trayApi?.setStatus('green'));
  attachIpc(bridge);

  try {
    await bridge.start();
    mcpSocket = await startMcpSocketHost(bridge);
    trayApi.setStatus('amber'); // listening, no client yet
    pushLog({
      ts: Date.now(),
      level: 'info',
      source: 'bridge',
      message: 'WS bridge listening on ' + bridge.status().url,
    });
    if (app.isPackaged) startAutoUpdate();
  } catch (err) {
    console.error('[claude-twin] start failed:', err);
    trayApi.setStatus('red');
    pushLog({
      ts: Date.now(),
      level: 'error',
      source: 'bridge',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

app.on('window-all-closed', () => {
  // Tray keeps the app alive on every platform.
});

app.on('before-quit', async () => {
  app.isQuitting = true;
  try {
    await mcpSocket?.stop();
  } catch (err) {
    console.warn('[claude-twin] mcp socket stop error:', err);
  }
  if (bridge) {
    try {
      await bridge.stop();
    } catch (err) {
      console.warn('[claude-twin] bridge stop error:', err);
    }
  }
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
