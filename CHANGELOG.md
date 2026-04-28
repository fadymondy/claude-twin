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
