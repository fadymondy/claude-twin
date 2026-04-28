import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WsBridge } from '../bridge/ws-host.js';

export function registerBridgeTool(server: McpServer, bridge: WsBridge): void {
  server.registerTool(
    'twin_bridge_status',
    {
      title: 'Twin bridge status',
      description:
        'Report the WebSocket bridge state — whether the host is listening, whether the extension is connected, and whether it has authenticated. Useful for verifying setup before invoking real browser tools.',
      inputSchema: {},
    },
    async () => {
      const status = bridge.status();
      return {
        content: [{ type: 'text', text: JSON.stringify(status) }],
        structuredContent: { ...status },
      };
    },
  );
}
