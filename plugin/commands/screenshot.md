---
name: screenshot
description: Capture a PNG screenshot of a browser tab's visible viewport.
---

The user invoked `/claude-twin:screenshot` with arguments: $ARGUMENTS

Parse as `[tab_id]`.

1. If no `tab_id`, call `twin_tabs` and ask which tab — never guess (screenshots can leak sensitive data).
2. Call `twin_screenshot` with `{ tab_id }`.
3. The result is a `data:image/png;base64,...` URL. Ask the user whether they want it saved (write the decoded bytes to disk via the Write tool) or just held in conversation context.
