import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MonitorRegistry } from '../state/monitors.js';

const registerSchema = {
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_-]+$/, 'lowercase letters, digits, _ or -')
    .describe('Unique slug — also the value of `source` on every emitted event.'),
  url: z.string().url().describe('Page the extension reloads/reads on each alarm.'),
  interval_min: z
    .number()
    .positive()
    .max(24 * 60)
    .describe('Polling interval in minutes (Chrome alarms minimum is 1).'),
  monitor_script: z
    .string()
    .optional()
    .describe(
      'Optional JS body evaluated in MAIN world to extract data. Falls back to title + first 2000 chars of body text + url.',
    ),
  realtime: z
    .boolean()
    .optional()
    .describe(
      'If true, the extension reads from an existing open tab without reloading. Defaults to true for whatsapp/slack/discord/telegram, false otherwise.',
    ),
};

export function registerMonitorTools(server: McpServer, registry: MonitorRegistry): void {
  server.registerTool(
    'twin_monitor_register',
    {
      title: 'Register a background monitor',
      description:
        'Tell the extension to poll a URL on a schedule. Each fire scrapes the page (custom script optional) and emits a `twin_log` event the agent can later query via `twin_monitor_results`.',
      inputSchema: registerSchema,
    },
    async ({ slug, url, interval_min, monitor_script, realtime }) => {
      const cfg: Parameters<MonitorRegistry['register']>[0] = {
        slug,
        url,
        intervalMin: interval_min,
      };
      if (monitor_script !== undefined) cfg.monitorScript = monitor_script;
      if (realtime !== undefined) cfg.realtime = realtime;
      await registry.register(cfg);
      const payload = { registered: true, slug };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    },
  );

  server.registerTool(
    'twin_monitor_unregister',
    {
      title: 'Unregister a background monitor',
      description: 'Stop a previously-registered monitor and clear its chrome alarm.',
      inputSchema: { slug: z.string().min(1) },
    },
    async ({ slug }) => {
      const removed = await registry.unregister(slug);
      const payload = { removed, slug };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    },
  );

  server.registerTool(
    'twin_monitor_list',
    {
      title: 'List active monitors',
      description: 'Return every currently-registered monitor config.',
      inputSchema: {},
    },
    async () => {
      const monitors = registry.list();
      const payload = { monitors };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    },
  );

  server.registerTool(
    'twin_monitor_results',
    {
      title: 'Recent monitor results',
      description:
        'Return recent `twin_log` events captured from monitor runs. Optionally filter by slug. Server-side cache holds the most recent 100 results per slug.',
      inputSchema: {
        slug: z.string().optional(),
        limit: z.number().int().positive().max(100).optional(),
      },
    },
    async ({ slug, limit }) => {
      const results = registry.results_for(slug, limit ?? 20);
      const payload = { results };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    },
  );
}
