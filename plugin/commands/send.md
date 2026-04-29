---
name: send
description: Send a message via a connected platform.
---

The user invoked `/claude-twin:send` with arguments: $ARGUMENTS

Parse as `<platform> <recipient> <message…>`. The recipient can be a channel name (`#general`), a DM target (`@alice`), or whatever the platform expects.

1. If any of the three pieces are missing, ask the user for the missing part — do not guess.
2. Call `twin_<platform>_send` with `{ recipient, message }` (or the platform's specific schema).
3. If the platform tool isn't yet installed, tell the user which v1 issue tracks it (see fadymondy/claude-twin issues #13–#29).
4. After a successful send, confirm with one line: `sent to <recipient> on <platform>`.

**Never send a message without confirming the recipient and the body with the user first.** Show the parsed `recipient` and `message` and ask for a yes before invoking the tool.
