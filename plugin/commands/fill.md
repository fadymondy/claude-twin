---
name: fill
description: Fill a form field in a browser tab.
---

The user invoked `/claude-twin:fill` with arguments: $ARGUMENTS

Parse as `<selector> <value> [tab_id]`. The value may contain spaces — everything after the selector and before an optional trailing numeric `tab_id` is the value.

1. If no `tab_id`, call `twin_tabs` and ask which tab — never guess.
2. Call `twin_fill` with `{ tab_id, selector, value }`.
3. The action rejects password-shaped selectors. Don't bypass the blocklist; ask the user for a different selector.
