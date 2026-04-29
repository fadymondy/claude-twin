# MCP tool reference

Every tool here is registered by `mcp-server/src/server.ts` and ships with the desktop app. Names are stable v1 API — breaking changes warrant a major bump (see `.github/CONTRIBUTING.md`).

All tools that drive the browser require the extension to be **connected and authenticated** to the bridge. Check first with `twin_bridge_status`.

## Health & meta

### `twin_ping`

Returns `{ pong: true, ts }`. No bridge needed — verifies the MCP server itself is alive.

### `twin_bridge_status`

Reports the WebSocket bridge state.

```json
{
  "listening": true,
  "url": "ws://127.0.0.1:9997/twin",
  "connected": true,
  "authenticated": true,
  "extensionId": "<chrome-id>",
  "pendingCommands": 0
}
```

### `twin_extension_ping`

Round-trips a `ping` command through the bridge to the extension. Returns the measured `roundTripMs` plus the extension version. Useful for end-to-end smoke testing.

## Tab management

### `twin_tabs`

List every open tab: `id`, `url`, `title`, `active`, `windowId`, `groupId`, `pinned`.

### `twin_open` `{ url, active?, group? }`

Open a new tab. By default opens in the background and joins the **claude-twin** tab group.

### `twin_close` `{ tab_id }`

Close a tab.

## DOM interaction

All three reject password-shaped selectors (`input[type=password]`, `[autocomplete=*-password]`, `name=password`, `#password`).

### `twin_click` `{ tab_id, selector }`

Click the element matched by `selector` in the target tab.

### `twin_fill` `{ tab_id, selector, value }`

Set the value via the React-friendly prototype `value` setter and dispatch `input` + `change` so frameworks pick it up. Works for `input`, `textarea`, contenteditable.

### `twin_screenshot` `{ tab_id }`

Capture the visible viewport as `data:image/png;base64,...`.

## Search

### `twin_search` `{ query }`

Open `google.com/search?q=<query>` in a background tab, scrape up to 10 organic results (`title`, `url`, `snippet`), close the tab.

## Dynamic ScriptEngine

### `twin_script_load` `{ script: { id, domain, code, active? } }`

Register a JS snippet to auto-inject on every tab whose host ends with `domain`.

### `twin_script_unload` `{ id }`

Remove a registered script.

### `twin_script_toggle` `{ id, active }`

Flip the `active` flag without unloading.

### `twin_script_list`

Return the dynamic-script registry.

### `twin_script_run` `{ domain, code }`

One-shot evaluation across every open tab matching `domain`. Doesn't persist.

## Background monitors

### `twin_monitor_register` `{ slug, url, interval_min, monitor_script?, realtime? }`

Tell the extension to poll `url` every `interval_min` minutes. Each fire pushes a `twin_log` event with `source: <slug>`. `realtime: true` (default for `whatsapp`/`slack`/`discord`/`telegram`) reads from an existing tab without reload; otherwise reload-then-read.

### `twin_monitor_unregister` `{ slug }`

Stop a monitor.

### `twin_monitor_list`

Return every active monitor config.

### `twin_monitor_results` `{ slug?, limit? }`

Recent `twin_log` events from the server-side ring buffer (100 per slug).

## Per-platform events

The 17 platform content scripts emit events as soon as they detect changes (new email, new message, caption text, etc.). They show up in `twin_monitor_results` with `source: <hostname-without-www>` and `eventType: <PLATFORM_EVENT_TYPE>` (e.g. `GMAIL_UNREAD_COUNT`, `SLACK_NEW_MESSAGE`).

There are no per-platform MCP tools — the agent reads events from the monitor results, and the desktop app's React UI renders them live in the **Events** tab.

## Errors

Every tool that talks to the extension can fail with one of three errors, surfaced as `isError: true` MCP results with friendly text:

- **BridgeNotConnectedError** — extension isn't connected. Launch the desktop app and load the extension.
- **CommandTimeoutError** — extension didn't respond in time. The browser tab may be busy or the offscreen document may have been suspended.
- **CommandFailedError** — the extension reported an error executing the action (e.g. blocklisted selector, missing tab).
