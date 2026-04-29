import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WsBridge, type WsBridgeOptions } from './bridge/ws-host.js';
import { registerPingTool } from './tools/ping.js';
import { registerBridgeTool } from './tools/bridge.js';
import { registerExtensionPingTool } from './tools/extension-ping.js';
import { registerTabTools } from './tools/tabs.js';
import { registerDomTools } from './tools/dom.js';
import { registerSearchTool } from './tools/search.js';
import { registerScriptTools } from './tools/scripts.js';
import { registerMonitorTools } from './tools/monitors.js';
import { registerSelftestTool } from './tools/selftest.js';
import { MonitorRegistry } from './state/monitors.js';

export const SERVER_NAME = 'claude-twin';
export const SERVER_VERSION = '0.0.0';

export interface CreateServerOptions {
  bridge?: WsBridgeOptions;
}

export interface CreatedServer {
  server: McpServer;
  bridge: WsBridge;
}

/**
 * Construct an MCP server with all twin_* tools wired up to the given bridge.
 * Use this when you already own a `WsBridge` (e.g. inside the Electron desktop
 * app, where one bridge is shared across multiple stdio shim connections).
 */
export function createMcpServer(bridge: WsBridge): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  registerPingTool(server);
  registerBridgeTool(server, bridge);
  registerExtensionPingTool(server, bridge);
  registerTabTools(server, bridge);
  registerDomTools(server, bridge);
  registerSearchTool(server, bridge);
  registerScriptTools(server, bridge);

  const monitors = new MonitorRegistry(bridge);
  registerMonitorTools(server, monitors);
  registerSelftestTool(server, monitors, bridge);

  return server;
}

/**
 * One-shot factory: creates a fresh `WsBridge` and an `McpServer` wired to it.
 * Used by the standalone `claude-twin-mcp` stdio binary that runs without
 * the Electron app (kept for tests and for users who don't want a desktop UI).
 */
export function createServer(opts: CreateServerOptions = {}): CreatedServer {
  const bridge = new WsBridge(opts.bridge ?? {});
  const server = createMcpServer(bridge);
  return { server, bridge };
}
