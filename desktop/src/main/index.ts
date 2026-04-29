/**
 * claude-twin desktop — Electron main process entry.
 *
 *   - boots a single BrowserWindow (visible on launch)
 *   - registers the system tray (3-state status colour: red/amber/green)
 *   - embeds the @claude-twin/mcp-server WsBridge directly so the user
 *     doesn't need a separate Node install
 *
 * mcp-server is `"type":"module"` ESM. Electron's main process here is
 * CJS, so we pull it in via `await import(...)` inside async functions.
 */

import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import type { WsBridge as WsBridgeT } from '@claude-twin/mcp-server/dist/bridge/ws-host.js';
import { createTray, type TrayApi } from './tray.js';
import { startMcpSocketHost, type McpSocketHost } from './mcp-socket.js';
import { attachIpc, pushLog } from './ipc.js';
import { startAutoUpdate, manualCheckForUpdates } from './auto-update.js';

let mainWindow: BrowserWindow | null = null;
let bridge: WsBridgeT | null = null;
let trayApi: TrayApi | null = null;
let mcpSocket: McpSocketHost | null = null;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 920,
    height: 640,
    show: false,
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

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow();
  mainWindow.show();
  mainWindow.focus();
}

function toggleWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    showWindow();
    return;
  }
  if (mainWindow.isVisible()) mainWindow.hide();
  else showWindow();
}

app.whenReady().then(async () => {
  mainWindow = createWindow();
  showWindow();

  trayApi = createTray({
    onShow: toggleWindow,
    onOpenSettings: () => {
      showWindow();
      mainWindow?.webContents.send('navigate', '/settings');
    },
    onCheckForUpdates: () => manualCheckForUpdates(),
    onQuit: () => {
      app.isQuitting = true;
      app.quit();
    },
  });

  try {
    const { WsBridge } = await import('@claude-twin/mcp-server/dist/bridge/ws-host.js');
    bridge = new WsBridge({
      token: process.env.CLAUDE_TWIN_WS_TOKEN ?? null,
    });

    bridge.on('ready', () => trayApi?.setStatus('green'));
    attachIpc(bridge);

    await bridge.start();
    mcpSocket = await startMcpSocketHost(bridge);
    trayApi.setStatus('amber');
    pushLog({
      ts: Date.now(),
      level: 'info',
      source: 'bridge',
      message: 'WS bridge listening on ' + bridge.status().url,
    });
    if (app.isPackaged) {
      startAutoUpdate((s) => trayApi?.setUpdateState(s));
    }
  } catch (err) {
    console.error('[claude-twin] start failed:', err);
    trayApi?.setStatus('red');
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
  showWindow();
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Electron {
    interface App {
      isQuitting?: boolean;
    }
  }
}
