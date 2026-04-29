# Per-platform notes

claude-twin observes 17 web apps via Chrome content scripts. None of them require server-side credentials — you log into each app normally in your browser, and the extension reads from the live tab.

| Platform        | Host pattern               | Default monitor interval | Realtime? |
| --------------- | -------------------------- | ------------------------ | --------- |
| Gmail           | `mail.google.com`          | 5 min                    | no        |
| Slack           | `app.slack.com`            | 1 min                    | yes       |
| WhatsApp        | `web.whatsapp.com`         | 1 min                    | yes       |
| Discord         | `discord.com`              | 1 min                    | yes       |
| Telegram        | `web.telegram.org`         | 1 min                    | yes       |
| X / Twitter     | `x.com`                    | 5 min                    | no        |
| GitHub          | `github.com`               | 5 min                    | no        |
| Linear          | `linear.app`               | 5 min                    | no        |
| Jira            | `*.atlassian.net`          | 5 min                    | no        |
| Google Calendar | `calendar.google.com`      | 15 min                   | no        |
| Cal.com         | `app.cal.com`              | 15 min                   | no        |
| Google Meet     | `meet.google.com`          | event-driven             | n/a       |
| Zoom            | `app.zoom.us`              | event-driven             | n/a       |
| GCP Console     | `console.cloud.google.com` | 30 min                   | no        |
| Claude.ai       | `claude.ai`                | 30 min                   | no        |
| OpenAI Platform | `platform.openai.com`      | 30 min                   | no        |
| Perplexity      | `perplexity.ai`            | 30 min                   | no        |

## How to enable a platform

1. Log into the platform in Chrome.
2. Open the claude-twin extension popup → **Permissions** tab.
3. Click **grant** next to the platform.
4. From a Claude Code session: `/claude-twin:watch <platform>` — registers a monitor with the default interval.

## Realtime vs. polled

- **Realtime** platforms (`whatsapp`, `slack`, `discord`, `telegram`) read live from the open tab without reloading. The content script's MutationObserver picks up new messages as they arrive.
- **Polled** platforms reload-then-read on each alarm fire (or open a new background tab if none exists, then close it).

## Meeting capture (gmeet / zoom)

- The content script detects when a meeting starts and emits `meeting_detected`.
- The popup shows a one-time **Allow / Deny** prompt. Captioning is **off by default** — you have to opt in per source.
- After approval, every caption line is streamed as a `caption` event.
- When the meeting ends, the full transcript is delivered as a single `meeting_ended` event with `{ captions, participants, title, startedAt }`.
- The transcript is **not persisted** outside the conversation. The desktop app logs only the meeting id + duration.

## Selectors

The selectors for each platform live at the top of the corresponding `extension/content/<platform>.js` file as a `const SEL = { ... }` block. When a platform's UI changes and a selector breaks, that's where to look. PRs to update selectors are welcome — see `.github/CONTRIBUTING.md`.

## Troubleshooting

| Symptom                                                 | Likely cause                                                                       | Fix                                                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Extension popup shows the platform but no events arrive | Not logged into the platform in this Chrome profile                                | Log in, refresh the tab                                                                                          |
| `auto-inject failed: ...` in the SW console             | A page CSP rejects the dynamic script                                              | The platform's content script still runs because it's declared in the manifest; only twin_script_run is affected |
| Monitor fires but always returns the same data          | Page is using SPA routing — `tabs.onUpdated complete` doesn't fire on internal nav | Open a new tab via `twin_open` and let claude-twin manage it                                                     |
| Caption events stop arriving mid-meeting                | The Meet / Zoom UI hid the captions panel                                          | Re-enable captions via the platform's own UI; the content script listens on the captions container               |
