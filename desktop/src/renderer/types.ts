export interface BridgeStatus {
  listening: boolean;
  connected: boolean;
  authenticated: boolean;
  extensionId: string | null;
  url: string;
  pendingCommands: number;
}

export interface TwinEvent {
  source: string;
  eventType: string;
  data: unknown;
  timestamp: number;
}

export interface TwinLog {
  ts: number;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
}

export interface ClaudeTwinApi {
  version: string;
  getStatus: () => Promise<BridgeStatus>;
  getRecentEvents: (opts?: { limit?: number }) => Promise<TwinEvent[]>;
  getRecentLogs: (opts?: { limit?: number }) => Promise<TwinLog[]>;
  onBridgeStatus: (h: (s: BridgeStatus) => void) => () => void;
  onEvent: (h: (e: TwinEvent) => void) => () => void;
  onLog: (h: (l: TwinLog) => void) => () => void;
  onNavigate: (h: (route: string) => void) => () => void;
}

declare global {
  interface Window {
    claudeTwin: ClaudeTwinApi;
  }
}
