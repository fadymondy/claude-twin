---
name: twin-meetings
description: Capture Google Meet / Zoom captions during a live meeting (with explicit user opt-in) and produce a structured post-meeting summary — attendees, decisions, action items.
---

# twin-meetings

Use when a meeting is detected (event source `gmeet` or `zoom`, eventType `meeting_detected`) or when the user asks "summarise the meeting I'm in".

## Live meeting

1. When `meeting_detected` fires, ask the user for opt-in by reminding them to click **Allow** in the claude-twin extension popup. Captioning is off by default per the privacy policy.
2. Once approved, the extension streams `caption` events. Display them as they arrive — do not buffer silently.
3. When `meeting_ended` arrives, the payload includes `{ captions, participants, title, startedAt }`.

## Post-meeting summary

Produce in this order:

1. **One-line headline.**
2. **Attendees** — comma-separated list from `participants`.
3. **Topics** — 3–5 bullet headings derived from caption clusters.
4. **Decisions** — explicit "we'll do X / let's go with Y" statements.
5. **Action items** — `owner: action (deadline if mentioned)`. Pull owner from the most recent speaker before the action verb.
6. Open the user's preferred capture surface (Linear / Jira / Gmail draft) only if they ask.

## Privacy

- Never persist caption text outside the conversation unless the user explicitly asks. The extension already drops the live transcript at meeting end; the desktop app's logs only record the meeting id + duration.
