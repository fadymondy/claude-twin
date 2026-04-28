/**
 * Monitor registry — in-memory store of background-poll configs that the
 * extension's monitor manager runs on alarms. Lives on the MCP server side
 * so the agent can register / unregister monitors via tools, and so the
 * results survive extension restarts (the extension is a thin runner).
 *
 * Push protocol: whenever the registry changes, or the extension reconnects,
 * we send `command(action='set_monitors', params={monitors:[...]})`. The
 * extension diff-applies against its own alarms and storage.
 */

import type { WsBridge } from '../bridge/ws-host.js';

export interface MonitorConfig {
  slug: string;
  url: string;
  intervalMin: number;
  /** Optional JS body evaluated in the tab to extract data. */
  monitorScript?: string;
  /** Mark slugs that should not reload the tab (e.g. realtime apps). */
  realtime?: boolean;
}

export interface MonitorResult {
  slug: string;
  data: unknown;
  ts: number;
  error?: string;
}

/** Realtime platforms read live from an open tab without reloading. */
export const DEFAULT_REALTIME_SLUGS = new Set(['whatsapp', 'slack', 'discord', 'telegram']);

export class MonitorRegistry {
  private readonly configs = new Map<string, MonitorConfig>();
  private readonly results = new Map<string, MonitorResult[]>();
  private readonly maxResultsPerSlug = 100;

  constructor(private readonly bridge: WsBridge) {
    bridge.on('ready', () => void this.pushAll().catch(() => undefined));
    bridge.onEvent((evt) => {
      if (evt.eventType === 'twin_log' && typeof evt.source === 'string') {
        this.recordResult(evt.source, evt.data, evt.timestamp);
      }
    });
  }

  list(): MonitorConfig[] {
    return [...this.configs.values()];
  }

  get(slug: string): MonitorConfig | undefined {
    return this.configs.get(slug);
  }

  async register(config: MonitorConfig): Promise<void> {
    if (!config.slug) throw new Error('register: slug required');
    if (!/^https?:\/\//.test(config.url)) throw new Error('register: url must be http(s)');
    if (!Number.isFinite(config.intervalMin) || config.intervalMin <= 0) {
      throw new Error('register: intervalMin must be a positive number');
    }
    const realtime = config.realtime ?? DEFAULT_REALTIME_SLUGS.has(config.slug);
    this.configs.set(config.slug, { ...config, realtime });
    await this.pushAll().catch(() => undefined);
  }

  async unregister(slug: string): Promise<boolean> {
    const removed = this.configs.delete(slug);
    if (removed) {
      await this.pushAll().catch(() => undefined);
    }
    return removed;
  }

  results_for(slug?: string, limit = 20): MonitorResult[] {
    if (slug) {
      const arr = this.results.get(slug) ?? [];
      return arr.slice(-limit);
    }
    const flat: MonitorResult[] = [];
    for (const arr of this.results.values()) flat.push(...arr);
    flat.sort((a, b) => b.ts - a.ts);
    return flat.slice(0, limit);
  }

  private recordResult(slug: string, data: unknown, ts: number): void {
    const list = this.results.get(slug) ?? [];
    list.push({ slug, data, ts: ts || Date.now() });
    while (list.length > this.maxResultsPerSlug) list.shift();
    this.results.set(slug, list);
  }

  private async pushAll(): Promise<void> {
    if (!this.bridge.isReady()) return;
    await this.bridge.sendCommand('set_monitors', { monitors: this.list() }, { timeoutMs: 5_000 });
  }
}
