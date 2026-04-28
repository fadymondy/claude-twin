import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WsBridge } from '../bridge/ws-host.js';
import { runTool } from './_helpers.js';

const scriptDefinition = z
  .object({
    id: z.string().min(1).describe('Stable identifier — used by unload / toggle / list.'),
    domain: z
      .string()
      .min(1)
      .describe('Hostname suffix to match (e.g. "github.com" matches "www.github.com").'),
    code: z.string().min(1).describe('JavaScript body to evaluate via `new Function(code)()`.'),
    active: z
      .boolean()
      .optional()
      .describe('If true (default), the script auto-injects on matching tabs as they load.'),
    runAt: z
      .enum(['document_start', 'document_end', 'document_idle'])
      .optional()
      .describe('Reserved — currently always document_idle (after `tabs.onUpdated` complete).'),
  })
  .describe('Dynamic script definition.');

const loadSchema = { script: scriptDefinition };
const idSchema = { id: z.string().min(1) };
const toggleSchema = { id: z.string().min(1), active: z.boolean() };
const runSchema = {
  domain: z
    .string()
    .min(1)
    .describe('Hostname suffix; matches every open tab whose host ends with this.'),
  code: z.string().min(1).describe('JavaScript body to evaluate in MAIN world.'),
};

export function registerScriptTools(server: McpServer, bridge: WsBridge): void {
  server.registerTool(
    'twin_script_load',
    {
      title: 'Load a dynamic script',
      description:
        'Register a JavaScript snippet that the extension will inject into every tab whose host ends with `domain`. Scripts persist in `chrome.storage.local` so they survive SW restarts. Use `active: false` to register without auto-injecting.',
      inputSchema: loadSchema,
    },
    async ({ script }) => runTool(async () => bridge.sendCommand('script_load', { script })),
  );

  server.registerTool(
    'twin_script_unload',
    {
      title: 'Unload a dynamic script',
      description: 'Remove a previously loaded dynamic script by id.',
      inputSchema: idSchema,
    },
    async ({ id }) => runTool(async () => bridge.sendCommand('script_unload', { id })),
  );

  server.registerTool(
    'twin_script_toggle',
    {
      title: 'Toggle a dynamic script active flag',
      description:
        'Flip the `active` flag on a registered script. Inactive scripts stay registered but do not auto-inject.',
      inputSchema: toggleSchema,
    },
    async ({ id, active }) =>
      runTool(async () => bridge.sendCommand('script_toggle', { id, active })),
  );

  server.registerTool(
    'twin_script_list',
    {
      title: 'List dynamic scripts',
      description: 'Return the dynamic-script registry as `{ scripts: { id: definition } }`.',
      inputSchema: {},
    },
    async () => runTool(async () => bridge.sendCommand('script_list', {})),
  );

  server.registerTool(
    'twin_script_run',
    {
      title: 'Run a one-shot script on matching tabs',
      description:
        'Evaluate JavaScript on every currently open tab whose host ends with `domain`. Does not register the script in the persistent registry. Use `twin_script_load` if you want auto-injection on future tab loads.',
      inputSchema: runSchema,
    },
    async ({ domain, code }) =>
      runTool(async () => bridge.sendCommand('script_run', { domain, code })),
  );
}
