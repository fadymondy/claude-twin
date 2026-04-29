---
name: twin-messaging
description: Cross-platform messaging triage — read recent unread/important threads across gmail, slack, discord, whatsapp, telegram in one pass and propose draft replies.
---

# twin-messaging

Use when the user asks "what's pending in my inbox", "any messages I should reply to", "triage my DMs", or similar across multiple messaging platforms.

## Steps

1. For each enabled platform (check `twin_bridge_status` plus the user's Permissions panel — only platforms they've granted host permission for):
   - Call the per-platform read tool (`twin_gmail_read`, `twin_slack_read`, etc.).
   - Take the last ~20 items.
2. Combine results into a single chronological list, newest first.
3. Group by sender if there are multiple from the same person.
4. Present a short table: `from / when / platform / preview`.
5. For items that explicitly ask the user a question, propose a 1–2 sentence draft reply. **Do not send anything** without an explicit `/claude-twin:send` invocation by the user.

## Out of scope

- Marking messages as read.
- Archiving / labelling — these need per-platform tools that aren't part of the v1 API.
- Reading attachments.
