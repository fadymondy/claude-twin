/**
 * Preload — exposes a minimal IPC surface to the renderer. Real
 * surface (subscribe to events / fetch monitor results) lands in #45.
 */

import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('claudeTwin', {
  version: '0.0.0',
});
