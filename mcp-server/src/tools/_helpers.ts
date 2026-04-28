import {
  BridgeNotConnectedError,
  CommandFailedError,
  CommandTimeoutError,
} from '../bridge/ws-host.js';

/**
 * Wrap an async function that calls into `bridge.sendCommand`, mapping
 * bridge-level errors into MCP `isError: true` results with friendly text.
 */
export async function runTool<R extends Record<string, unknown>>(fn: () => Promise<R>) {
  try {
    const payload = await fn();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
      structuredContent: payload,
    };
  } catch (err) {
    return {
      isError: true,
      content: [{ type: 'text' as const, text: describeBridgeError(err) }],
    };
  }
}

export function describeBridgeError(err: unknown): string {
  if (err instanceof BridgeNotConnectedError) {
    return `Extension is not connected to the bridge. Launch the claude-twin desktop app and load the extension, then retry. (${err.message})`;
  }
  if (err instanceof CommandTimeoutError) {
    return `Extension did not respond within ${err.timeoutMs}ms. The browser tab may be busy or the offscreen document may have been suspended. (${err.message})`;
  }
  if (err instanceof CommandFailedError) {
    return `Extension reported an error: ${err.cause.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}
