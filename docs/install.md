# Install

claude-twin is three things working together:

1. **claude-twin desktop app** — Electron app that hosts the MCP server and a local WebSocket bridge. Mandatory.
2. **claude-twin Chrome extension** — observes the 17 supported web apps from inside your browser.
3. **claude-twin Claude Code plugin** — registers `claude-twin-mcp` as an MCP server in your Claude Code config and ships the `/claude-twin:*` slash commands.

## 1. Install the desktop app

### Recommended (signed releases — coming with the first GitHub Release)

- **macOS** — `claude-twin-<version>.dmg` (Apple Silicon + Intel)
- **Windows** — `claude-twin-<version>-setup.exe`
- **Linux** — `claude-twin-<version>.AppImage`

After install, launch the app. It lives in your **system tray** (top-right menubar on macOS, system tray on Windows / Linux). Click the icon to see status.

> **macOS: `"claude-twin" is damaged and can't be opened.`** v0.1.0 ships unsigned (Apple Developer ID signing lands in v0.2). The "damaged" message is Gatekeeper rejecting the quarantine xattr Safari/Chrome added on download — the app is fine. Strip it once after dragging to `/Applications`:
>
> ```sh
> xattr -cr /Applications/claude-twin.app
> ```
>
> Then re-open from Launchpad or Finder.

### Build from source

```sh
git clone https://github.com/fadymondy/claude-twin
cd claude-twin
npm install
npm -w @claude-twin/mcp-server run build
npm -w @claude-twin/desktop run package           # current platform → desktop/dist/
```

The first launch creates `~/Library/Application Support/claude-twin/mcp.sock` (macOS) or the equivalent path on your platform — that's the local socket the Claude Code shim talks to.

## 2. Install the Chrome extension

### From the Chrome Web Store (when published)

Coming with the first release.

### Load unpacked (until then)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top right).
3. Click **Load unpacked** and choose the `extension/` directory from the cloned repo.
4. Pin the **claude-twin** action button to your toolbar.

The popup's **Permissions** tab lists the 17 supported platforms. Click **grant** next to each platform you want claude-twin to observe — this requests the corresponding Chrome host permission on demand.

## 3. Install the Claude Code plugin

### Via the marketplace (when published)

```sh
claude plugin install fadymondy/claude-twin
```

### Manual

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "claude-twin": {
      "type": "stdio",
      "command": "claude-twin-mcp"
    }
  }
}
```

The desktop app installs `claude-twin-mcp` into your `PATH`. If `which claude-twin-mcp` returns nothing, see [Troubleshooting](#troubleshooting).

## 4. Verify

In a Claude Code session:

```
/mcp
```

You should see `claude-twin` listed. Then:

```
> Use the twin_bridge_status tool
```

The result should show `listening: true, connected: true, authenticated: true`. If `connected: false`, the extension isn't running — open Chrome and check the popup.

## Troubleshooting

| Symptom                                                | Cause                                                                  | Fix                                                                                                                                                                                                          |
| ------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| macOS: `"claude-twin" is damaged and can't be opened.` | Unsigned build + quarantine xattr from browser download                | Run `xattr -cr /Applications/claude-twin.app` once after install. Permanent fix lands in v0.2 with an Apple Developer ID.                                                                                    |
| `claude-twin-mcp: command not found`                   | Desktop app didn't install the bin into PATH                           | macOS: `ln -s "/Applications/claude-twin.app/Contents/Resources/shim/claude-twin-mcp.cjs" /usr/local/bin/claude-twin-mcp`. Linux: AppImage extract. Windows: ensure the installer's PATH option was checked. |
| Tray icon stays red                                    | WS bridge couldn't bind to `127.0.0.1:9997`                            | Quit any other claude-twin instance, or set `CLAUDE_TWIN_WS_PORT=9998` before launching.                                                                                                                     |
| Tray icon stays amber                                  | Bridge listening but extension not connected                           | Open Chrome with the extension loaded and pinned. Check the **Status** tab in the popup.                                                                                                                     |
| Popup shows `auth fail: invalid token`                 | `CLAUDE_TWIN_WS_TOKEN` set in the desktop env but not in the extension | In the popup's Status tab there's a token field — paste the same value.                                                                                                                                      |

See [Per-platform notes](./platforms.md) for site-specific setup tips and [MCP tool reference](./tools.md) for the full tool surface.
