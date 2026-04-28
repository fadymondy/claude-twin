import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WsBridge } from '../bridge/ws-host.js';
import { runTool } from './_helpers.js';

const tabIdSchema = z.number().int().positive().describe('Tab id from `twin_tabs` or `twin_open`.');

const clickSchema = {
  tab_id: tabIdSchema,
  selector: z.string().min(1).describe('CSS selector of the element to click.'),
};

const fillSchema = {
  tab_id: tabIdSchema,
  selector: z
    .string()
    .min(1)
    .describe('CSS selector of an input / textarea / contenteditable element.'),
  value: z.string().describe('Value to set on the element.'),
};

const screenshotSchema = {
  tab_id: tabIdSchema,
};

export function registerDomTools(server: McpServer, bridge: WsBridge): void {
  server.registerTool(
    'twin_click',
    {
      title: 'Click an element',
      description:
        'Click the element matching the given CSS selector in a target tab. Selectors that look like password fields (`input[type=password]`, `[autocomplete=current-password]`, etc.) are blocked by safety policy.',
      inputSchema: clickSchema,
    },
    async ({ tab_id, selector }) =>
      runTool(async () => {
        const result = await bridge.sendCommand<{
          clicked: true;
          selector: string;
          tab_id: number;
        }>('click', { tab_id, selector });
        return result;
      }),
  );

  server.registerTool(
    'twin_fill',
    {
      title: 'Fill a form field',
      description:
        'Set the value of an input / textarea / contenteditable element. Dispatches `input` and `change` events so frameworks (React / Vue / Angular) pick the change up. Password-shaped selectors are blocked by safety policy.',
      inputSchema: fillSchema,
    },
    async ({ tab_id, selector, value }) =>
      runTool(async () => {
        const result = await bridge.sendCommand<{ filled: true; selector: string; tab_id: number }>(
          'fill',
          { tab_id, selector, value },
        );
        return result;
      }),
  );

  server.registerTool(
    'twin_screenshot',
    {
      title: 'Screenshot the visible part of a tab',
      description:
        "Capture a PNG screenshot of the visible viewport of the target tab (Chrome `tabs.captureVisibleTab`). Returns a `data:image/png;base64,...` URL. Cannot capture content blocked by `<iframe>` cross-origin policies; that's a Chrome limitation.",
      inputSchema: screenshotSchema,
    },
    async ({ tab_id }) =>
      runTool(async () => {
        const result = await bridge.sendCommand<{ data_url: string; tab_id: number }>(
          'screenshot',
          { tab_id },
        );
        return result;
      }),
  );
}
