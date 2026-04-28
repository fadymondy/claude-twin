# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial repository scaffolding, gh-pms label set, issue and PR templates.
- Monorepo workspace layout (`extension/`, `mcp-server/`, `plugin/`) with TypeScript project references, shared `tsconfig.base.json`, ESLint, Prettier, EditorConfig, and `.nvmrc`.
- Baseline GitHub Actions CI workflow (`.github/workflows/ci.yml`) running `npm ci`, lint, format check, and typecheck on push and pull requests.
