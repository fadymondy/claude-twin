import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WsBridge, type WsBridgeOptions } from './bridge/ws-host.js';
import { registerPingTool } from './tools/ping.js';
import { registerBridgeTool } from './tools/bridge.js';
import { registerExtensionPingTool } from './tools/extension-ping.js';

export const SERVER_NAME = 'claude-twin';
export const SERVER_VERSION = '0.0.0';

export interface CreateServerOptions {
  bridge?: WsBridgeOptions;
}

export interface CreatedServer {
  server: McpServer;
  bridge: WsBridge;
}

export function createServer(opts: CreateServerOptions = {}): CreatedServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );
  const bridge = new WsBridge(opts.bridge ?? {});

  registerPingTool(server);
  registerBridgeTool(server, bridge);
  registerExtensionPingTool(server, bridge);

  return { server, bridge };
}
