# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial repository scaffolding, gh-pms label set, issue and PR templates.
- Monorepo workspace layout (`extension/`, `mcp-server/`, `plugin/`) with TypeScript project references, shared `tsconfig.base.json`, ESLint, Prettier, EditorConfig, and `.nvmrc`.
- Baseline GitHub Actions CI workflow (`.github/workflows/ci.yml`) running `npm ci`, lint, format check, and typecheck on push and pull requests.
- MCP server skeleton (`mcp-server/`): boots over stdio using `@modelcontextprotocol/sdk`, registers a `twin_ping` health-check tool, handles graceful shutdown on `SIGINT` / `SIGTERM` / stdin close.
- Chrome MV3 extension scaffold (`extension/`): manifest with `tabs`/`scripting`/`storage`/`offscreen`/`alarms`/`tabGroups` permissions, host permission for Google search, and 17 optional host permissions covering all v1 platform integrations. Includes a service-worker stub (install hook, popup-message router, offscreen lifecycle), an offscreen-document placeholder, and a styled popup with status display + Enabled/Privacy toggles.
- WebSocket bridge between the MCP server and the Chrome extension's offscreen document: `WsBridge` host on `ws://127.0.0.1:9997/twin` (loopback-only, optional token auth, `CLAUDE_TWIN_WS_PORT/HOST/TOKEN` env overrides), wire-protocol type definitions in `mcp-server/src/bridge/protocol.ts`, full offscreen client (auth handshake, exponential-backoff reconnect capped at 30s, in-memory queue capped at 500 messages, ping/pong keepalive every 25s with 10s pong-deadline drop), service-worker `forwardToOffscreen` helper + `OFFSCREEN_EVENT` handler (`STATUS_UPDATE`/`AUTH_STATUS`/`SERVER_CONFIG`/`ALERT`), and a new `twin_bridge_status` MCP tool reporting listening / connected / authenticated state.
