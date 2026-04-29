---
name: read
description: Read recent items from a connected platform (gmail, slack, whatsapp, discord, telegram, x, github, linear, jira, gcal, calcom, gmeet, zoom, gcp, claude, openai, perplexity).
---

The user invoked `/claude-twin:read` with arguments: $ARGUMENTS

Parse the arguments as `<platform> [target]` (whitespace-separated). The first token is the platform slug, the rest is an optional target (channel name, contact, label, etc.).

1. If no platform is given, list the available platforms from `twin_bridge_status` and ask which one.
2. Otherwise call the matching MCP tool: `twin_<platform>_read` (or the closest equivalent).
3. If the platform tool isn't installed yet, fall back to `twin_extension_ping` to confirm the bridge is alive and tell the user the platform is on the v1 backlog (issues #13–#29 in fadymondy/claude-twin).
4. Format the result as a short bullet list — one bullet per item with `from / time / snippet`. Don't dump raw JSON unless the user asks.
