import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WsBridge } from '../bridge/ws-host.js';
import { runTool } from './_helpers.js';

interface BrowserTab {
  id: number | null;
  url: string | null;
  title: string | null;
  active: boolean;
  windowId: number | null;
  groupId: number | null;
  pinned: boolean;
}

const openSchema = {
  url: z.string().url().describe('Absolute http(s) URL to open.'),
  active: z.boolean().optional().describe('Focus the new tab. Defaults to false (background tab).'),
  group: z
    .boolean()
    .optional()
    .describe('Add the new tab to the "claude-twin" tab group. Defaults to true.'),
};

const closeSchema = {
  tab_id: z
    .number()
    .int()
    .positive()
    .describe('Tab id to close (from `twin_tabs` or the `tab_id` returned by `twin_open`).'),
};

export function registerTabTools(server: McpServer, bridge: WsBridge): void {
  server.registerTool(
    'twin_tabs',
    {
      title: 'List browser tabs',
      description:
        "List every open tab in the user's browser. Returns id, url, title, active flag, windowId, tab-group id, and pinned flag for each tab. Use this before `twin_click` / `twin_fill` / `twin_screenshot` to pick a target.",
      inputSchema: {},
    },
    async () =>
      runTool(async () => {
        const result = await bridge.sendCommand<{ tabs: BrowserTab[] }>('tabs', {});
        return result;
      }),
  );

  server.registerTool(
    'twin_open',
    {
      title: 'Open a new tab',
      description:
        'Open a new tab in the user\'s browser. By default the tab opens in the background and joins the "claude-twin" tab group so it stays out of the user\'s active workflow. Returns the new tab id.',
      inputSchema: openSchema,
    },
    async ({ url, active, group }) =>
      runTool(async () => {
        const params: Record<string, unknown> = { url };
        if (active !== undefined) params.active = active;
        if (group !== undefined) params.group = group;
        const result = await bridge.sendCommand<{ tab_id: number | null; url: string | null }>(
          'open',
          params,
        );
        return result;
      }),
  );

  server.registerTool(
    'twin_close',
    {
      title: 'Close a tab',
      description: 'Close the tab with the given id.',
      inputSchema: closeSchema,
    },
    async ({ tab_id }) =>
      runTool(async () => {
        const result = await bridge.sendCommand<{ closed: true; tab_id: number }>('close', {
          tab_id,
        });
        return result;
      }),
  );
}
