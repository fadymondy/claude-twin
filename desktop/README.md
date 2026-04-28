# @claude-twin/desktop

Electron desktop app for [claude-twin](../README.md). Bundles the MCP server and WS bridge in the main process, renders live twin events / logs in a React renderer, and lives in the system tray.

## Dev

```sh
npm -w @claude-twin/desktop run dev
```

Loads the renderer from Vite's dev server (`http://localhost:5173`); main + preload are bundled with esbuild via `electron-vite`.

## Build (unsigned, local)

```sh
npm -w @claude-twin/desktop run package          # current platform
npm -w @claude-twin/desktop run package:mac      # .dmg
npm -w @claude-twin/desktop run package:win      # NSIS .exe
npm -w @claude-twin/desktop run package:linux    # .AppImage
```

Signed / notarized release is wired in [#46](https://github.com/fadymondy/claude-twin/issues/46). The renderer / IPC surface lands in [#45](https://github.com/fadymondy/claude-twin/issues/45). MCP-server embedding lands in [#42](https://github.com/fadymondy/claude-twin/issues/42).
