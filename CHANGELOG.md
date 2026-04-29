# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **v1 — first complete release.**
  - Monorepo with four workspaces: `extension/` (MV3 Chrome extension), `mcp-server/` (Node MCP server + WS bridge core), `desktop/` (Electron app, the mandatory entry point), `plugin/` (Claude Code plugin manifest + slash commands + skills).
  - **MCP server** with 14 tools: `twin_ping`, `twin_bridge_status`, `twin_extension_ping`, `twin_tabs`, `twin_open`, `twin_close`, `twin_click`, `twin_fill`, `twin_screenshot`, `twin_search`, `twin_script_load`, `twin_script_unload`, `twin_script_toggle`, `twin_script_list`, `twin_script_run`, `twin_monitor_register`, `twin_monitor_unregister`, `twin_monitor_list`, `twin_monitor_results`. Stable v1 API.
  - **WebSocket bridge** on `127.0.0.1:9997/twin` (loopback-only, optional token, command/response/event envelopes, exponential-backoff reconnect, in-memory queue, ping/pong keepalive).
  - **Chrome MV3 extension** with 17 platform content scripts (Gmail, Slack, WhatsApp, Discord, Telegram, X + X-Premium, GitHub, Linear, Jira, GCal, Cal.com, Google Meet, Zoom, GCP Console, Claude.ai, OpenAI Platform, Perplexity), dynamic ScriptEngine, alarms-driven monitor manager, tabbed popup (status / monitors / scripts / permissions / meeting opt-in).
  - **Electron desktop app**: tray-first UX (3-state status colour, auto-launch on login, Settings menu), embedded MCP server + WS bridge, local Unix-socket / named-pipe stdio shim (`claude-twin-mcp`) for Claude Code, React main window with bridge / events / monitors / logs panes streaming live via IPC, electron-updater wired to GitHub Releases.
  - **Claude Code plugin**: `plugin/.claude-plugin/plugin.json` auto-registers the `claude-twin-mcp` stdio shim, six slash commands (`/claude-twin:read|send|watch|click|fill|screenshot`), three high-level skills (`twin-monitor`, `twin-messaging`, `twin-meetings`).
  - **CI** workflow runs lint / format / typecheck / build / extension-zip artifact on every push and PR.
  - **Release** workflow fires on `v*.*.*` tag push: cross-platform Electron builds (mac arm64+x64, Windows NSIS, Linux AppImage) with optional code signing + notarization secrets, npm publish for the standalone MCP server, extension zip attached to the GitHub Release, auto-generated release notes from this CHANGELOG.
  - **Docs**: `docs/install.md` (step-by-step + troubleshooting), `docs/tools.md` (full MCP tool reference), `docs/platforms.md` (per-platform notes + selectors guide).
