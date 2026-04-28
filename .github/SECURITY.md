# Security Policy

If you discover any security related issues, please email info@3x1.io instead of using the issue tracker.

## Scope

`claude-twin` runs locally and is intended for the user's own browser sessions. Security-relevant areas:

- The MCP server's local WebSocket bridge (port `9997` by default) — bound to `127.0.0.1`. Report any path that allows external connections or auth bypass.
- The Chrome extension's content scripts — report any way an external page could exfiltrate user data through the bridge.
- The dynamic `ScriptEngine` — scripts are loaded from the local MCP host. Report any path that lets an untrusted origin inject scripts.

Do **not** open public issues for security findings. We aim to respond within 72 hours.
