# @claude-twin/plugin

Claude Code plugin manifest for [claude-twin](../README.md). Installing this plugin auto-registers the local MCP server via the `claude-twin-mcp` stdio shim that ships with the desktop app.

## Install

```sh
# Once the marketplace is wired (see #35), this becomes a single click:
claude plugin install fadymondy/claude-twin

# Until then, in your project's .mcp.json:
{
  "mcpServers": {
    "claude-twin": { "command": "claude-twin-mcp" }
  }
}
```

The `claude-twin-mcp` binary is installed by the [claude-twin desktop app](../desktop/) (#43). Without the desktop app running, the shim prints an actionable error and exits.

## Slash commands

The plugin ships `/twin:read`, `/twin:send`, `/twin:watch`, `/twin:click`, `/twin:fill`, `/twin:screenshot` — see [#31](https://github.com/fadymondy/claude-twin/issues/31).

## Skills

Higher-level workflows: `twin-monitor`, `twin-messaging`, `twin-meetings` — see [#32](https://github.com/fadymondy/claude-twin/issues/32).
