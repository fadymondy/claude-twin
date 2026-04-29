import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MonitorRegistry } from '../state/monitors.js';
import type { WsBridge } from '../bridge/ws-host.js';

const schema = {
  slug: z.string().optional().describe('Optional — limit to a single monitor slug.'),
  staleness_factor: z
    .number()
    .positive()
    .max(10)
    .optional()
    .describe(
      'Multiplier on the configured interval — a monitor is "stale" if it has not fired within `factor × intervalMin` minutes. Defaults to 2.',
    ),
};

interface PerSlugResult {
  slug: string;
  url: string;
  intervalMin: number;
  registered: boolean;
  lastUpdateTs: number | null;
  ageMin: number | null;
  stale: boolean;
  ok: boolean;
  reason: string | null;
  resultsCount: number;
}

interface SelftestResult {
  bridge: { listening: boolean; connected: boolean; authenticated: boolean };
  ts: number;
  monitors: PerSlugResult[];
  summary: { total: number; ok: number; stale: number; missing: number };
}

export function registerSelftestTool(
  server: McpServer,
  registry: MonitorRegistry,
  bridge: WsBridge,
): void {
  server.registerTool(
    'twin_selftest',
    {
      title: 'Twin selftest',
      description:
        'Health-check every registered monitor (or a single slug). Reports the bridge connection state plus per-monitor age + staleness flag. Use this to detect when a platform selector has broken and the monitor is silently not producing events.',
      inputSchema: schema,
    },
    async ({ slug, staleness_factor }) => {
      const factor = staleness_factor ?? 2;
      const now = Date.now();
      const targets = slug ? [registry.get(slug)].filter(Boolean) : registry.list();

      const monitors: PerSlugResult[] = [];
      for (const cfg of targets) {
        if (!cfg) continue;
        const recent = registry.results_for(cfg.slug, 1);
        const last = recent[recent.length - 1];
        const lastTs = last?.ts ?? null;
        const ageMin = lastTs == null ? null : Math.floor((now - lastTs) / 60_000);
        const stale = ageMin == null ? true : ageMin > cfg.intervalMin * factor;
        monitors.push({
          slug: cfg.slug,
          url: cfg.url,
          intervalMin: cfg.intervalMin,
          registered: true,
          lastUpdateTs: lastTs,
          ageMin,
          stale,
          ok: !stale,
          reason: stale
            ? lastTs == null
              ? 'no events received yet'
              : `last update ${ageMin}m ago, expected ≤ ${cfg.intervalMin * factor}m`
            : null,
          resultsCount: registry.results_for(cfg.slug, 1000).length,
        });
      }

      // If user asked for a slug we don't know, report missing.
      if (slug && monitors.length === 0) {
        monitors.push({
          slug,
          url: '',
          intervalMin: 0,
          registered: false,
          lastUpdateTs: null,
          ageMin: null,
          stale: true,
          ok: false,
          reason: 'no such monitor — use twin_monitor_register first',
          resultsCount: 0,
        });
      }

      const status = bridge.status();
      const payload: SelftestResult = {
        bridge: {
          listening: status.listening,
          connected: status.connected,
          authenticated: status.authenticated,
        },
        ts: now,
        monitors,
        summary: {
          total: monitors.length,
          ok: monitors.filter((m) => m.ok).length,
          stale: monitors.filter((m) => m.stale && m.registered).length,
          missing: monitors.filter((m) => !m.registered).length,
        },
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
        structuredContent: { ...payload },
      };
    },
  );
}
