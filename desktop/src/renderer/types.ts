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

export interface CliState {
  installed: boolean;
  target: string | null;
  source: string;
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
  cliState: () => Promise<CliState>;
  cliInstall: () => Promise<{ ok: boolean; state?: CliState; error?: string }>;
  cliUninstall: () => Promise<{ ok: boolean; error?: string }>;
  getToken: () => Promise<string | null>;
  rotateToken: () => Promise<string>;
  historyEvents: (opts?: {
    source?: string;
    since?: number;
    until?: number;
    limit?: number;
  }) => Promise<TwinEvent[]>;
  historyLogs: (opts?: { level?: string; since?: number; limit?: number }) => Promise<TwinLog[]>;
  historyClear: () => Promise<{ events: number; logs: number }>;
  historyExport: () => Promise<
    | { ok: true; path: string; events: number; logs: number }
    | { ok: false; canceled?: boolean; error?: string }
  >;
  historyImport: () => Promise<
    { ok: true; events: number; logs: number } | { ok: false; canceled?: boolean; error?: string }
  >;
}

declare global {
  interface Window {
    claudeTwin: ClaudeTwinApi;
  }
}
