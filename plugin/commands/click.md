---
name: click
description: Click an element in a browser tab.
---

The user invoked `/claude-twin:click` with arguments: $ARGUMENTS

Parse as `<selector> [tab_id]`.

1. If no `tab_id`, call `twin_tabs` to list current tabs and ask the user which one — never guess.
2. Call `twin_click` with `{ tab_id, selector }`.
3. If the selector matches a password field the action will be rejected by the safety blocklist — tell the user to use a more specific non-credential selector.
