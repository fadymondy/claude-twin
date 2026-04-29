---
name: watch
description: Watch a platform for new events and stream them into the conversation.
---

The user invoked `/claude-twin:watch` with arguments: $ARGUMENTS

Parse as `<platform> [target]`.

1. Register a monitor via `twin_monitor_register` with a sensible interval (1–5 min for messaging platforms, 30 min for usage / billing). Use the platform name as the slug if no target is given; otherwise `<platform>-<target>`.
2. Confirm with one line: `watching <slug> every <interval>min`.
3. Tell the user they can list active monitors with `twin_monitor_list` and recent results with `twin_monitor_results`. They can stop with `twin_monitor_unregister`.

If the platform isn't supported yet, point at the relevant v1 backlog issue.
