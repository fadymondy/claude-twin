# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] — 2026-04-29

Patch release fixing three v0.1.0 install-day defects.

### Fixed

- **Desktop**: `claude-twin-mcp` shim was packaged inside `app.asar` instead of `Resources/shim/`, so the symlink the first-launch installer dropped into `~/.local/bin` pointed at a path that didn't exist. The symlink existed but `which claude-twin-mcp` failed and Claude Code's MCP discovery couldn't reach the server. Moved `shim/` to `extraResources` in `desktop/electron-builder.yml` so it lands at `Contents/Resources/shim/` outside the asar archive.
- **Plugin**: `claude plugin install fadymondy/claude-twin` failed because the manifest lived at `plugin/.claude-plugin/plugin.json` but the marketplace resolver expects `.claude-plugin/marketplace.json` at the repo root. Added a root marketplace.json that references the existing `plugin/` directory — no need to relocate the plugin sources.
- **Extension**: the popup's Status tab had no token field, so when the desktop bridge required a token (always — `ensureToken()` generates one on first launch) the WebSocket auth failed silently with close code 4401 and the offscreen reconnected indefinitely with the same wrong (or absent) token. Added a token input + Save button to the popup; the offscreen now force-reconnects on token change instead of waiting up to 30 s on the existing backoff.

First public release. Five surfaces — Chrome extension, MCP server, Electron desktop app, Claude Code plugin, VSCode extension — installable via `.dmg` / `.exe` / `.AppImage` + `claude plugin install`.

### Added

#### Core

- Monorepo with five workspaces: `extension/` (MV3 Chrome extension), `mcp-server/` (Node MCP server + WS bridge core), `desktop/` (Electron app, the mandatory entry point), `plugin/` (Claude Code plugin manifest + slash commands + skills), `vscode-extension/` (VSCode extension with command palette + live-events sidebar).
- **MCP server** with 20 tools, stable v1 API:
  - Health: `twin_ping`, `twin_bridge_status`, `twin_extension_ping`, `twin_selftest`
  - Tabs: `twin_tabs`, `twin_open`, `twin_close`
  - DOM: `twin_click`, `twin_fill`, `twin_screenshot` (password-shaped selectors blocked)
  - Search: `twin_search`
  - Dynamic scripts: `twin_script_load`, `twin_script_unload`, `twin_script_toggle`, `twin_script_list`, `twin_script_run`
  - Monitors: `twin_monitor_register`, `twin_monitor_unregister`, `twin_monitor_list`, `twin_monitor_results`
- **WebSocket bridge** on `127.0.0.1:9997/twin` — loopback-only, optional token auth, command/response/event envelopes, exponential-backoff reconnect (capped 30 s), in-memory queue (capped 500), 25 s ping/pong keepalive.
- **Chrome MV3 extension** with 17 platform content scripts: Gmail, Slack, WhatsApp, Discord, Telegram, X + X-Premium, GitHub, Linear, Jira, Google Calendar, Cal.com, Google Meet, Zoom, GCP Console, Claude.ai, OpenAI Platform, Perplexity. Dynamic ScriptEngine, alarms-driven monitor manager, tabbed popup (status / monitors / scripts / permissions / meeting opt-in / update banner).
- **Electron desktop app** (mandatory entry point):
  - Tray-first UX with 3-state status colour and tooltips
  - Embedded MCP server + WS bridge — no separate Node install
  - Local Unix-socket / named-pipe stdio shim (`claude-twin-mcp`) for Claude Code
  - React main window with Bridge / Events / Monitors / Logs panes
  - Settings page: CLI installer, bridge token (auto-generated, rotatable), history export/import/clear
  - electron-updater auto-update on launch + manual "Check for updates…" tray item
  - Persistent event store at `<userData>/events.sqlite` (better-sqlite3)
  - Native notifications on `ALERT` events (per-user opt-in)
- **Claude Code plugin**: `plugin/.claude-plugin/plugin.json` auto-registers the stdio shim, six slash commands (`/claude-twin:read|send|watch|click|fill|screenshot`), three high-level skills (`twin-monitor`, `twin-messaging`, `twin-meetings`).
- **VSCode extension**: command palette (`claude-twin: …`) for every MCP tool, live-events sidebar webview, status-bar connection indicator.

#### Build, CI, Release

- CI workflow runs lint / format / typecheck / build / test / extension-zip artifact on every push + PR.
- Release workflow fires on `v*.*.*` tag push: signed cross-platform Electron builds (mac arm64+x64 with notarization, Windows NSIS, Linux AppImage), npm publish for `@claude-twin/mcp-server`, extension zip attached to the GitHub Release, auto-generated release notes from this CHANGELOG.
- 18 unit tests covering `WsBridge` (auth, command bus, errors, reconnect lifecycle) and `MonitorRegistry` (validation, ring buffer, push-on-ready).

#### Docs

- `docs/install.md` — step-by-step install + troubleshooting
- `docs/tools.md` — full MCP tool reference
- `docs/platforms.md` — per-platform notes + selector guide
- `docs/release.md` — release-pipeline secrets / Apple Developer ID / Windows code-signing
- `docs/manual-release-tasks.md` — checklist for tagging / Chrome Web Store / Anthropic plugin marketplace
- `docs/permissions.md` — per-permission audit
- `.github/CONTRIBUTING.md`, `.github/SECURITY.md`, `.github/FUNDING.yml`

### Known limitations / deferred

The following are deliberately out of scope for v0.1.0 and tracked for v0.2:

- Localization scaffolding ([#86](https://github.com/fadymondy/claude-twin/issues/86)) — strings are hardcoded English.
- Crash reporting / opt-in telemetry ([#87](https://github.com/fadymondy/claude-twin/issues/87)) — Sentry integration plumbing exists conceptually but no SDK is shipped.
- Multi-machine bridge ([#89](https://github.com/fadymondy/claude-twin/issues/89)) — bridge is loopback-only by design.
