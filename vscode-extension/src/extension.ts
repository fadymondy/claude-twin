/**
 * claude-twin VSCode extension.
 *
 * - On activation, connects to the desktop app's local MCP socket
 * - Status bar item shows live connection state
 * - Output channel logs MCP traffic
 * - Each `twin_*` MCP tool becomes a `claude-twin: …` command
 *   discoverable via the command palette (`Cmd+Shift+P`)
 */

import * as vscode from 'vscode';
import { McpClient, type ToolDefinition } from './mcp-client';
import { EventsViewProvider } from './events-view';

let client: McpClient | null = null;
let statusBar: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;
let eventsView: EventsViewProvider | null = null;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel('claude-twin');
  context.subscriptions.push(outputChannel);

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'claudeTwin.checkStatus';
  statusBar.text = '$(circle-slash) claude-twin';
  statusBar.tooltip = 'claude-twin — disconnected';
  statusBar.show();
  context.subscriptions.push(statusBar);

  client = new McpClient((msg) => outputChannel.appendLine(`[mcp] ${msg}`));
  client.onStatus((status, message) => {
    if (status === 'ready') {
      statusBar.text = '$(check) claude-twin';
      statusBar.tooltip = 'claude-twin — connected to desktop app';
    } else if (status === 'connecting') {
      statusBar.text = '$(sync~spin) claude-twin';
      statusBar.tooltip = 'claude-twin — connecting…';
    } else if (status === 'error') {
      statusBar.text = '$(error) claude-twin';
      statusBar.tooltip = `claude-twin — ${message ?? 'error'}`;
    } else {
      statusBar.text = '$(circle-slash) claude-twin';
      statusBar.tooltip = 'claude-twin — disconnected';
    }
  });

  eventsView = new EventsViewProvider(client, context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(EventsViewProvider.viewType, eventsView),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeTwin.checkStatus', () => commandCheckStatus()),
    vscode.commands.registerCommand('claudeTwin.reconnect', () => commandReconnect()),
    vscode.commands.registerCommand('claudeTwin.runTool', () => commandRunTool()),
    vscode.commands.registerCommand('claudeTwin.listTabs', () => commandListTabs()),
    vscode.commands.registerCommand('claudeTwin.openUrl', () => commandOpenUrl()),
    vscode.commands.registerCommand('claudeTwin.search', () => commandSearch()),
    vscode.commands.registerCommand('claudeTwin.registerMonitor', () => commandRegisterMonitor()),
    vscode.commands.registerCommand('claudeTwin.recentEvents', () => commandRecentEvents()),
    vscode.commands.registerCommand('claudeTwin.focusEvents', () => eventsView?.focus()),
  );

  if (vscode.workspace.getConfiguration('claudeTwin').get<boolean>('autoConnect', true)) {
    void connect();
  }
}

export function deactivate(): void {
  client?.disconnect();
  client = null;
}

async function connect(): Promise<void> {
  if (!client) return;
  try {
    await client.connect();
    outputChannel.appendLine('connected');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    outputChannel.appendLine(`connect failed: ${msg}`);
    void vscode.window
      .showErrorMessage(`claude-twin: ${msg}`, 'Retry', 'Open output')
      .then((choice) => {
        if (choice === 'Retry') void connect();
        if (choice === 'Open output') outputChannel.show();
      });
  }
}

async function commandCheckStatus(): Promise<void> {
  await ensureConnected();
  if (!client) return;
  try {
    const result = await client.callTool('twin_bridge_status');
    outputChannel.show(true);
    outputChannel.appendLine(`twin_bridge_status: ${JSON.stringify(result)}`);
  } catch (err) {
    showError(err);
  }
}

async function commandReconnect(): Promise<void> {
  client?.disconnect();
  await connect();
}

async function commandRunTool(): Promise<void> {
  await ensureConnected();
  if (!client) return;
  try {
    const tools = await client.listTools();
    interface ToolPickItem extends vscode.QuickPickItem {
      tool: ToolDefinition;
    }
    const items: ToolPickItem[] = tools.map((t) => {
      const item: ToolPickItem = { label: t.name, tool: t };
      if (t.title) item.description = t.title;
      if (t.description) item.detail = t.description.slice(0, 200);
      return item;
    });
    const pick = await vscode.window.showQuickPick<ToolPickItem>(items, {
      placeHolder: 'Pick a claude-twin tool',
      matchOnDetail: true,
    });
    if (!pick) return;
    const args = await collectArgs(pick.tool);
    if (!args) return;
    const result = await client.callTool(pick.tool.name, args);
    outputChannel.show(true);
    outputChannel.appendLine(`${pick.tool.name}: ${JSON.stringify(result, null, 2)}`);
  } catch (err) {
    showError(err);
  }
}

async function commandListTabs(): Promise<void> {
  await runAndShow('twin_tabs', {});
}

async function commandOpenUrl(): Promise<void> {
  const url = await vscode.window.showInputBox({
    prompt: 'URL to open',
    placeHolder: 'https://example.com',
    validateInput: (v) => (/^https?:\/\//.test(v) ? null : 'Must be http(s) URL'),
  });
  if (!url) return;
  await runAndShow('twin_open', { url, active: true });
}

async function commandSearch(): Promise<void> {
  const query = await vscode.window.showInputBox({ prompt: 'Google search query' });
  if (!query) return;
  await runAndShow('twin_search', { query });
}

async function commandRegisterMonitor(): Promise<void> {
  const slug = await vscode.window.showInputBox({
    prompt: 'Monitor slug (lowercase, digits, _ or -)',
    validateInput: (v) => (/^[a-z0-9_-]+$/.test(v) ? null : 'Invalid slug'),
  });
  if (!slug) return;
  const url = await vscode.window.showInputBox({
    prompt: 'URL to poll',
    validateInput: (v) => (/^https?:\/\//.test(v) ? null : 'Must be http(s) URL'),
  });
  if (!url) return;
  const intervalStr = await vscode.window.showInputBox({
    prompt: 'Interval in minutes',
    value: '5',
    validateInput: (v) => (Number.parseFloat(v) > 0 ? null : 'Must be > 0'),
  });
  if (!intervalStr) return;
  await runAndShow('twin_monitor_register', {
    slug,
    url,
    interval_min: Number.parseFloat(intervalStr),
  });
}

async function commandRecentEvents(): Promise<void> {
  await runAndShow('twin_monitor_results', { limit: 50 });
}

async function runAndShow(toolName: string, args: Record<string, unknown>): Promise<void> {
  await ensureConnected();
  if (!client) return;
  try {
    const result = await client.callTool(toolName, args);
    outputChannel.show(true);
    outputChannel.appendLine(`${toolName}(${JSON.stringify(args)}):`);
    outputChannel.appendLine(JSON.stringify(result, null, 2));
  } catch (err) {
    showError(err);
  }
}

async function ensureConnected(): Promise<void> {
  if (!client) return;
  if (client.status() === 'ready') return;
  await connect();
}

async function collectArgs(tool: ToolDefinition): Promise<Record<string, unknown> | null> {
  const props = tool.inputSchema?.properties ?? {};
  const required = new Set(tool.inputSchema?.required ?? []);
  const args: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(props)) {
    const value = await vscode.window.showInputBox({
      prompt: `${tool.name} — ${name}${required.has(name) ? ' (required)' : ' (optional)'}`,
      placeHolder: schema.description ?? '',
    });
    if (value === undefined) return null;
    if (value === '' && !required.has(name)) continue;
    args[name] = coerce(value, schema.type);
  }
  return args;
}

function coerce(raw: string, type?: string): unknown {
  if (type === 'number' || type === 'integer') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (type === 'boolean') return raw === 'true' || raw === '1';
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function showError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  outputChannel.show(true);
  outputChannel.appendLine(`error: ${message}`);
  void vscode.window.showErrorMessage(`claude-twin: ${message}`);
}
