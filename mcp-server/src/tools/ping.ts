import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerPingTool(server: McpServer): void {
  server.registerTool(
    'twin_ping',
    {
      title: 'Twin Ping',
      description:
        'Health check. Returns { pong: true, ts: epoch_ms }. Useful for verifying the MCP server is alive before driving real browser tools.',
      inputSchema: {},
    },
    async () => {
      const payload = { pong: true, ts: Date.now() };
      return {
        content: [{ type: 'text', text: JSON.stringify(payload) }],
        structuredContent: payload,
      };
    },
  );
}
