/**
 * VSCode webview that streams live twin events from the desktop app.
 *
 * The view registers itself as `claudeTwin.events` (declared in
 * package.json) and is hosted in a custom activity-bar container.
 *
 * Data flow:
 *   - On webview resolution, we call `client.listTools()` once to verify
 *     connectivity. We don't pull events directly — the MCP socket is
 *     request/response, not push. Instead we periodically poll
 *     `twin_monitor_results` and merge into the sidebar's local list.
 *   - Filter / clear are handled client-side; rendering is plain
 *     vanilla DOM (no React) to keep the bundle tiny.
 */

import * as vscode from 'vscode';
import type { McpClient } from './mcp-client';

interface SidebarEvent {
  ts: number;
  source: string;
  data: unknown;
}

export class EventsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'claudeTwin.events';

  private view?: vscode.WebviewView;
  private pollTimer: NodeJS.Timeout | null = null;
  private events: SidebarEvent[] = [];

  constructor(
    private readonly client: McpClient,
    private readonly extensionUri: vscode.Uri,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    view.webview.html = this.html();
    view.webview.onDidReceiveMessage((msg) => this.handleMessage(msg));

    // Start polling once visible. Stop when hidden.
    view.onDidChangeVisibility(() => {
      if (view.visible) this.startPoll();
      else this.stopPoll();
    });
    if (view.visible) this.startPoll();
  }

  focus(): void {
    void vscode.commands.executeCommand('claudeTwin.events.focus');
  }

  private startPoll(): void {
    this.stopPoll();
    void this.tick();
    this.pollTimer = setInterval(() => void this.tick(), 5_000);
  }

  private stopPoll(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private async tick(): Promise<void> {
    if (this.client.status() !== 'ready') {
      this.send({ type: 'status', status: this.client.status() });
      return;
    }
    try {
      const result = (await this.client.callTool('twin_monitor_results', { limit: 50 })) as
        | { structuredContent?: { results?: { slug: string; data: unknown; ts: number }[] } }
        | undefined;
      const rows = result?.structuredContent?.results ?? [];
      for (const r of rows) {
        // De-dup by ts+slug
        const seen = this.events.some((e) => e.ts === r.ts && e.source === r.slug);
        if (!seen) this.events.push({ ts: r.ts, source: r.slug, data: r.data });
      }
      this.events.sort((a, b) => b.ts - a.ts);
      this.events = this.events.slice(0, 200);
      this.send({ type: 'events', events: this.events });
      this.send({ type: 'status', status: 'ready' });
    } catch (err) {
      this.send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  private handleMessage(msg: { type: string }): void {
    if (msg.type === 'clear') {
      this.events = [];
      this.send({ type: 'events', events: [] });
    } else if (msg.type === 'reconnect') {
      void vscode.commands.executeCommand('claudeTwin.reconnect');
    }
  }

  private send(payload: unknown): void {
    this.view?.webview.postMessage(payload);
  }

  private html(): string {
    return /* html */ `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
  <style>
    body { font: var(--vscode-font-family); margin: 0; padding: 8px; color: var(--vscode-foreground); }
    .toolbar { display:flex; gap:8px; margin-bottom:8px; align-items:center; }
    .toolbar input { flex:1; padding:4px 6px; border:1px solid var(--vscode-input-border); background:var(--vscode-input-background); color:var(--vscode-input-foreground); border-radius:3px; }
    .toolbar button { padding:4px 8px; border:1px solid var(--vscode-button-border, transparent); background:var(--vscode-button-background); color:var(--vscode-button-foreground); cursor:pointer; border-radius:3px; }
    .toolbar button.secondary { background:transparent; color:var(--vscode-foreground); border-color:var(--vscode-input-border); }
    .status { font-size:11px; color:var(--vscode-descriptionForeground); margin-bottom:8px; }
    .status.ready::before { content:'● '; color:#16a34a; }
    .status.connecting::before { content:'● '; color:#f59e0b; }
    .status.disconnected::before, .status.error::before { content:'● '; color:#dc2626; }
    ul { list-style:none; padding:0; margin:0; font-size:12px; }
    li { padding:4px 0; border-bottom:1px solid var(--vscode-input-border); }
    .row { display:flex; gap:8px; align-items:baseline; }
    .ts { color:var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; }
    .source { font-weight:600; color:var(--vscode-textLink-foreground); }
    .data { font-family: var(--vscode-editor-font-family); white-space:pre-wrap; word-break:break-all; }
  </style>
</head>
<body>
  <div class="toolbar">
    <input id="filter" placeholder="filter by source" />
    <button id="clear" class="secondary">clear</button>
    <button id="reconnect" class="secondary">reconnect</button>
  </div>
  <div id="status" class="status disconnected">disconnected</div>
  <ul id="list"></ul>
  <script>
    const vscode = acquireVsCodeApi();
    const filter = document.getElementById('filter');
    const status = document.getElementById('status');
    const list = document.getElementById('list');
    let events = [];

    function render() {
      const q = filter.value.trim().toLowerCase();
      list.innerHTML = '';
      const visible = q ? events.filter(e => e.source.toLowerCase().includes(q)) : events;
      for (const e of visible.slice(0, 200)) {
        const li = document.createElement('li');
        const time = new Date(e.ts).toLocaleTimeString();
        const data = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
        li.innerHTML = '<div class="row"><span class="ts">' + time + '</span><span class="source">' + e.source + '</span></div><div class="data">' + data.slice(0, 400) + '</div>';
        list.appendChild(li);
      }
      if (visible.length === 0) {
        list.innerHTML = '<li style="color:var(--vscode-descriptionForeground);text-align:center;padding:24px 0;">no events yet — register a monitor with twin_monitor_register</li>';
      }
    }

    filter.addEventListener('input', render);
    document.getElementById('clear').addEventListener('click', () => vscode.postMessage({type:'clear'}));
    document.getElementById('reconnect').addEventListener('click', () => vscode.postMessage({type:'reconnect'}));

    window.addEventListener('message', (msg) => {
      const m = msg.data;
      if (m.type === 'events') { events = m.events; render(); }
      else if (m.type === 'status') {
        status.className = 'status ' + m.status;
        status.textContent = m.status;
      }
      else if (m.type === 'error') {
        status.className = 'status error';
        status.textContent = 'error: ' + m.message;
      }
    });
  </script>
</body>
</html>`;
  }
}
