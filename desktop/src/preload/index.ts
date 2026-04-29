/**
 * Preload — typed, narrow IPC surface for the renderer. The renderer
 * never touches Node, Electron, or the WS bridge directly.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

type Subscriber<T> = (payload: T) => void;

function subscribe<T>(channel: string, handler: Subscriber<T>): () => void {
  const listener = (_: IpcRendererEvent, payload: T): void => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.off(channel, listener);
}

contextBridge.exposeInMainWorld('claudeTwin', {
  version: '0.1.0',

  // Snapshots
  getStatus: () => ipcRenderer.invoke('twin/get-status'),
  getRecentEvents: (opts?: { limit?: number }) =>
    ipcRenderer.invoke('twin/get-recent-events', opts),
  getRecentLogs: (opts?: { limit?: number }) => ipcRenderer.invoke('twin/get-recent-logs', opts),

  // Subscriptions
  onBridgeStatus: (handler: Subscriber<unknown>) => subscribe('twin/bridge-status', handler),
  onEvent: (handler: Subscriber<unknown>) => subscribe('twin/event', handler),
  onLog: (handler: Subscriber<unknown>) => subscribe('twin/log', handler),
  onNavigate: (handler: Subscriber<string>) => subscribe('navigate', handler),

  // Settings
  cliState: () => ipcRenderer.invoke('twin/cli-state'),
  cliInstall: () => ipcRenderer.invoke('twin/cli-install'),
  cliUninstall: () => ipcRenderer.invoke('twin/cli-uninstall'),
  getToken: () => ipcRenderer.invoke('twin/get-token'),
  rotateToken: () => ipcRenderer.invoke('twin/rotate-token'),

  // History
  historyEvents: (opts?: { source?: string; since?: number; until?: number; limit?: number }) =>
    ipcRenderer.invoke('twin/history-events', opts),
  historyLogs: (opts?: { level?: string; since?: number; limit?: number }) =>
    ipcRenderer.invoke('twin/history-logs', opts),
  historyClear: () => ipcRenderer.invoke('twin/history-clear'),
  historyExport: () => ipcRenderer.invoke('twin/history-export'),
  historyImport: () => ipcRenderer.invoke('twin/history-import'),
});
