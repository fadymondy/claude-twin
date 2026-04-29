# Permissions audit

The Chrome extension declares each permission for a specific reason. We audit before each release to make sure we're requesting only what we actively use.

## Required `permissions`

| Permission      | Why we need it                                                                                  | Used in                                                  |
| --------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `tabs`          | Listing / opening / closing browser tabs (`twin_tabs`/`twin_open`/`twin_close`)                 | `extension/commands/tabs.js`                             |
| `scripting`     | Injecting content scripts dynamically (DOM tools, ScriptEngine, Google search, monitor manager) | `extension/commands/{dom,scripts,search,monitors}.js`    |
| `storage`       | Persisting popup settings + dynamic-script registry + monitor config                            | every command module reads/writes `chrome.storage.local` |
| `offscreen`     | Running the persistent WebSocket connection in an offscreen document (SW would otherwise sleep) | `extension/background/service-worker.js`                 |
| `alarms`        | Periodic background polls (monitor manager + update checker)                                    | `extension/commands/monitors.js`, `update-checker.js`    |
| `tabGroups`     | Adding background tabs to the "claude-twin" tab group so they stay collapsed                    | `extension/commands/tabs.js`                             |
| `notifications` | Surfacing `ALERT` events as native desktop notifications (per-user opt-in via popup)            | `extension/background/service-worker.js`                 |

## `host_permissions`

`*://www.google.com/*` — required for `twin_search` (Google search proxy).

## `optional_host_permissions`

The 17 platform integrations are all opt-in. The popup's **Permissions** tab calls `chrome.permissions.request` only for the platforms the user clicks **grant** on. The user can revoke any of them at any time. Listed below for transparency:

`mail.google.com`, `app.slack.com`, `web.whatsapp.com`, `discord.com`, `web.telegram.org`, `x.com`, `github.com`, `linear.app`, `*.atlassian.net`, `calendar.google.com`, `app.cal.com`, `meet.google.com`, `app.zoom.us`, `console.cloud.google.com`, `claude.ai`, `platform.openai.com`, `perplexity.ai`.

## What we do **not** request

We deliberately don't ask for:

- `webRequest` / `webRequestBlocking` — we never inspect or modify network traffic.
- `cookies` — content scripts run in the user's existing logged-in session.
- `downloads` — screenshots return a `data:` URL; the user (or their MCP tool) decides where to save.
- `clipboardWrite` / `clipboardRead` — we never read or write the system clipboard.
- `<all_urls>` host permission — host access is always platform-scoped via the optional list.

## Verification

When the user installs the extension:

1. Chrome shows the required-permission set. They see exactly the table above.
2. The platform host permissions are **not** in that prompt (they're optional).
3. The first time the user grants a platform from the popup, Chrome prompts for that single host.
