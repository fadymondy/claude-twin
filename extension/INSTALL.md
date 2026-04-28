# Loading the unpacked extension

1. Build (TS placeholder is a no-op for now): `npm -w @claude-twin/extension run build`
2. Open `chrome://extensions` in Chrome / Edge / Brave.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and choose this `extension/` directory.
5. Pin the **claude-twin** action button to the toolbar — clicking it opens the popup.

The popup shows MCP-bridge connection status, alerts today, and toggles for "Enabled" / "Privacy mode". The persistent WebSocket connection to the MCP server (port `9997`) lands in [#5](https://github.com/fadymondy/claude-twin/issues/5); until then the bridge stays in the `disconnected` state by design.

## Permissions

The base manifest requests `tabs`, `scripting`, `storage`, `offscreen`, `alarms`, `tabGroups` and a single host permission for `www.google.com` (used by `twin_search`). Per-platform host permissions (Gmail, Slack, etc.) are declared as **optional** and are granted on-demand from the popup's permissions panel (lands in [#12](https://github.com/fadymondy/claude-twin/issues/12)).
