---
name: twin-monitor
description: Set up a recurring background poll of one of the supported platforms (gmail, slack, github, gcp-billing, claude-usage, openai-usage, perplexity-usage, etc.) via the claude-twin extension. Returns the slug + interval and tells the user how to stream results.
---

# twin-monitor

Use this skill when the user wants to monitor a platform on a recurring interval — phrases like "watch X for me", "ping me when X changes", "run X every N minutes".

## Steps

1. Identify the platform slug. Ask if ambiguous. Valid slugs: `gmail`, `slack`, `whatsapp`, `discord`, `telegram`, `x`, `github`, `linear`, `jira`, `gcal`, `calcom`, `gmeet`, `zoom`, `gcp-billing`, `claude-usage`, `openai-usage`, `perplexity-usage`.
2. Pick a sensible interval:
   - Realtime messaging (`whatsapp`, `slack`, `discord`, `telegram`): 1–2 min.
   - Inbox / dev (`gmail`, `github`, `linear`, `jira`): 5 min.
   - Calendar (`gcal`, `calcom`): 15 min.
   - Usage / billing (`gcp-billing`, `claude-usage`, `openai-usage`, `perplexity-usage`): 30 min.
3. Determine the platform's URL (e.g. `https://mail.google.com/mail/u/0/`).
4. Call `twin_monitor_register` with `{ slug, url, interval_min }`.
5. Confirm: `watching <slug> every <N>min — results stream as twin_log events; query with twin_monitor_results({slug:"<slug>"})`.

## Recovery

- If `twin_bridge_status` shows the bridge is not authenticated, tell the user to launch the claude-twin desktop app and load the Chrome extension before retrying.
- If a slug is already registered, prefer `twin_monitor_unregister` then re-register only if the interval changes.
