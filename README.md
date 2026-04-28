# claude-twin

A self-contained digital-twin system for Claude Code:

- **`extension/`** — Manifest V3 Chrome extension that observes 17 web apps you're already logged into (Gmail, Slack, WhatsApp, Discord, Telegram, X, GitHub, Linear, Jira, Google Calendar, Cal.com, Google Meet, Zoom, GCP Billing, Claude.ai, OpenAI Platform, Perplexity).
- **`mcp-server/`** — Local Node/TypeScript MCP server. Runs a WebSocket bridge that the extension connects to, and exposes a stable command bus (`twin_read`, `twin_send`, `twin_click`, `twin_screenshot`, `twin_watch`, …) as MCP tools.
- **`plugin/`** — Claude Code plugin manifest that auto-registers the MCP server and ships slash commands and skills (`/twin:read`, `/twin:send`, `/twin:watch`).

## Status

Early development. Feature work is tracked under the **v1** milestone — see [Issues](https://github.com/fadymondy/claude-twin/issues).

## Quick architecture

```
┌───────────────────┐   stdio    ┌──────────────────┐    ws     ┌─────────────────┐
│  Claude Code CLI  │◀──────────▶│   mcp-server/    │◀─────────▶│   extension/    │
│ (plugin installed)│   MCP      │  (Node, local)   │ 127.0.0.1 │  (MV3, Chrome)  │
└───────────────────┘            │  hosts WS bridge │   :9997   │  17 content     │
                                 │  exposes tools   │           │  scripts        │
                                 └──────────────────┘           └─────────────────┘
```

## License

MIT. See [LICENSE](LICENSE).

## Contributing

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md). Security issues: see [.github/SECURITY.md](.github/SECURITY.md).
