import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WsBridge } from '../bridge/ws-host.js';
import { runTool } from './_helpers.js';

const schema = {
  query: z.string().min(1).max(2000).describe('Google search query.'),
};

interface SearchResult {
  title: string;
  url: string;
  snippet: string | null;
}

export function registerSearchTool(server: McpServer, bridge: WsBridge): void {
  server.registerTool(
    'twin_search',
    {
      title: 'Google search',
      description:
        "Run a Google search and return up to 10 organic results (title / url / snippet). Opens a background tab on www.google.com, scrapes the visible SERP, and closes the tab. Times out after 15s. Useful when the user references something the agent doesn't have direct context for.",
      inputSchema: schema,
    },
    async ({ query }) =>
      runTool(async () => {
        const result = await bridge.sendCommand<{ query: string; results: SearchResult[] }>(
          'search',
          { query },
          { timeoutMs: 20_000 },
        );
        return result;
      }),
  );
}
