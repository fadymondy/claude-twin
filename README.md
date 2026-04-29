# claude-twin

A self-contained digital-twin system for Claude Code. Drives 17 web apps you're already logged into — Gmail, Slack, WhatsApp, Discord, Telegram, X, GitHub, Linear, Jira, Google Calendar, Cal.com, Google Meet, Zoom, GCP Console, Claude.ai, OpenAI Platform, Perplexity — from inside a Claude Code conversation. Nothing leaves your machine.

## Quick architecture

```
┌───────────────────┐  stdio   ┌─────────────────────────────────────────┐    ws    ┌─────────────────┐
│  Claude Code CLI  │◀────────▶│             desktop/  (Electron)        │◀────────▶│   extension/    │
│ (plugin installed)│  shim    │ ┌─────────────────┐  ┌─────────────────┐│ 127.0.0.1│  (MV3, Chrome)  │
└───────────────────┘  ↕ sock  │ │  main process   │  │  renderer (Vite ││  :9997   │  17 content     │
                               │ │  • mcp-server   │  │   + React)      ││          │  scripts        │
                               │ │  • WsBridge     │◀▶│  Bridge / Events││          └─────────────────┘
                               │ │  • IPC sock     │  │  / Logs / Cards ││
                               │ └─────────────────┘  └─────────────────┘│
                               │  System tray: status, show details,     │
                               │  auto-launch on login, quit.            │
                               └─────────────────────────────────────────┘
```

The desktop app is the only authoritative entry point. The extension and Claude Code's plugin are passive proxies that attach to the running desktop app.

## Components

- **[`desktop/`](desktop/)** — Electron app. Embeds the MCP server + WS bridge. System-tray-first UX. Renders live events / logs / per-platform monitor cards in a React main window.
- **[`extension/`](extension/)** — Manifest V3 Chrome extension. 17 platform content scripts + popup with status / monitors / scripts / permissions / meeting-opt-in tabs.
- **[`mcp-server/`](mcp-server/)** — `WsBridge` host + the full `twin_*` MCP tool surface. Embedded in the desktop app; also installable standalone for tests.
- **[`plugin/`](plugin/)** — Claude Code plugin manifest. Registers the `claude-twin-mcp` stdio shim and ships `/claude-twin:*` slash commands plus three high-level skills (`twin-monitor`, `twin-messaging`, `twin-meetings`).

## Install

See **[docs/install.md](docs/install.md)** for the full step-by-step. TL;DR:

1. Download the desktop app (`.dmg` / `.exe` / `.AppImage`) from [GitHub Releases](https://github.com/fadymondy/claude-twin/releases).
2. Launch it — lives in your system tray.
3. Load the unpacked Chrome extension from `extension/`.
4. `claude plugin install fadymondy/claude-twin` (or add to `.mcp.json` manually).
5. From a Claude Code session: `/claude-twin:watch gmail` and you're off.

## Documentation

- [docs/install.md](docs/install.md) — install + verify + troubleshooting
- [docs/tools.md](docs/tools.md) — full MCP tool reference (`twin_ping`, `twin_tabs`, `twin_open`, `twin_close`, `twin_click`, `twin_fill`, `twin_screenshot`, `twin_search`, `twin_script_*`, `twin_monitor_*`, `twin_bridge_status`, `twin_extension_ping`)
- [docs/platforms.md](docs/platforms.md) — per-platform host patterns, intervals, realtime vs polled, meeting capture flow

## License

MIT. See [LICENSE](LICENSE).

## Contributing

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md). Security issues: see [.github/SECURITY.md](.github/SECURITY.md).
