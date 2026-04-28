# Contributing

Contributions are **welcome** and will be fully **credited**.

Please read and understand the contribution guide before creating an issue or pull request.

## Etiquette

This project is open source — maintainers donate their free time. Please be considerate when raising issues or pull requests.

## Project scope

`claude-twin` is a self-contained system with three components:

- **`extension/`** — Manifest V3 Chrome extension that observes a curated set of web apps the user is logged into.
- **`mcp-server/`** — Local Node/TypeScript MCP server that hosts a WebSocket bridge for the extension and exposes the command bus as MCP tools.
- **`plugin/`** — Claude Code plugin manifest that registers the MCP server and ships slash commands / skills.

Features should land in one (and ideally only one) component. Generic browser automation that doesn't fit the digital-twin use case is probably out of scope.

## Procedure

Before filing an issue:

- Check existing issues — your bug or feature may already be tracked.
- Reproduce the problem against the latest `main` build of all three components.

Before submitting a pull request:

- Run the relevant component's tests (`pnpm -C extension test`, `pnpm -C mcp-server test`).
- For extension changes: load the unpacked extension and verify the affected platform manually.
- For MCP server changes: confirm tools are still listed via `npx @modelcontextprotocol/inspector`.
- Update `CHANGELOG.md` (`Unreleased` section) when applicable.

## Requirements

- **Node 20+** for the MCP server and extension build.
- **`gh` CLI** authenticated, for PR / issue work.
- **Bash 4+** for any helper scripts.

### Code style

- TypeScript strict mode, no `any` unless justified.
- Follow the patterns used by sibling content scripts under `extension/content/` — observer + messenger + language helpers are shared.
- Keep MCP tool names stable (`twin_*` prefix); they are public API.

### Pull request hygiene

- One concern per PR.
- Coherent commit history — squash WIP commits before opening the PR.
- Use your own git config — **no `Co-Authored-By: Claude` lines** in commits or PR bodies.
- PR body must include `Closes #N` so the issue auto-closes on merge.

### Versioning

We follow [SemVer 2.0](https://semver.org). MCP tool names and slash command signatures are public API. Breaking changes warrant a major bump.

**Happy contributing!**
