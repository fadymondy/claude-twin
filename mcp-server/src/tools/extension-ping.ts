import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  BridgeNotConnectedError,
  CommandFailedError,
  CommandTimeoutError,
  type WsBridge,
} from '../bridge/ws-host.js';

const schema = {
  timeout_ms: z
    .number()
    .int()
    .positive()
    .max(60_000)
    .optional()
    .describe('Override the default 30s command timeout.'),
};

interface ExtensionPingResult {
  pong: true;
  ts: number;
  version: string;
  roundTripMs: number;
}

export function registerExtensionPingTool(server: McpServer, bridge: WsBridge): void {
  server.registerTool(
    'twin_extension_ping',
    {
      title: 'Twin extension ping',
      description:
        'Round-trip a `ping` command through the WebSocket bridge to the connected extension. Returns the extension-reported timestamp + version plus the measured round-trip latency in ms. Fails with a clear error if the extension is not connected or the command times out.',
      inputSchema: schema,
    },
    async ({ timeout_ms }) => {
      const started = Date.now();
      try {
        const opts: { timeoutMs?: number } = {};
        if (timeout_ms !== undefined) opts.timeoutMs = timeout_ms;
        const result = await bridge.sendCommand<{ pong: true; ts: number; version: string }>(
          'ping',
          {},
          opts,
        );
        const payload: ExtensionPingResult = {
          pong: true,
          ts: result.ts,
          version: result.version,
          roundTripMs: Date.now() - started,
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(payload) }],
          structuredContent: { ...payload },
        };
      } catch (err) {
        const message = describeError(err);
        return {
          isError: true,
          content: [{ type: 'text', text: message }],
        };
      }
    },
  );
}

function describeError(err: unknown): string {
  if (err instanceof BridgeNotConnectedError) {
    return `Extension is not connected to the bridge. Launch the claude-twin desktop app and load the extension, then retry. (${err.message})`;
  }
  if (err instanceof CommandTimeoutError) {
    return `Extension did not respond within ${err.timeoutMs}ms. The browser may be busy or the offscreen document may have been suspended. (${err.message})`;
  }
  if (err instanceof CommandFailedError) {
    return `Extension reported an error executing the ping action: ${err.cause.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}
