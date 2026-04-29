# claude-twin for VSCode

Drive the [claude-twin](../README.md) desktop app from inside VSCode.

## Requirements

- The **claude-twin desktop app** must be running ([install it first](../docs/install.md)). The extension connects to its local MCP socket — no separate process spawning, no PATH lookup needed.
- The Chrome extension must be loaded for any tool that drives a real browser tab (search, click, fill, screenshot, per-platform reads). Tools that just check the bridge (`twin_ping`, `twin_bridge_status`, `twin_extension_ping`) work without it.

## Commands (`Cmd+Shift+P` → search "claude-twin")

- **Check status** — runs `twin_bridge_status`, shows the result in the output channel
- **Run a tool…** — pick from any `twin_*` tool, fills inputs interactively
- **List browser tabs** — `twin_tabs`
- **Open URL in browser** — `twin_open`
- **Google search** — `twin_search`
- **Register a monitor** — `twin_monitor_register`
- **Show recent twin_log events** — `twin_monitor_results`
- **Reconnect to desktop app** — closes and reopens the socket

## Status bar

The right-hand status bar shows the live connection:

- `$(circle-slash) claude-twin` — disconnected (desktop app not running)
- `$(sync~spin) claude-twin` — connecting
- `$(check) claude-twin` — ready
- `$(error) claude-twin` — last connect failed (click to retry)

Click the item to run a status check.

## Settings

- `claudeTwin.autoConnect` (default `true`) — connect on VSCode startup.
- `claudeTwin.shimCommand` — reserved; the extension currently bypasses the shim and connects to the socket directly. Documented for forward compatibility.

## Build / package

```sh
npm -w @claude-twin/vscode-extension run build
npm -w @claude-twin/vscode-extension run package      # → claude-twin-0.0.0.vsix
code --install-extension claude-twin-0.0.0.vsix
```
