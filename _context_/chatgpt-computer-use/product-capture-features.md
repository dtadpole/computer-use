---
title: Record and Replay and Appshots
created: 2026-11-01T09:13:00Z
modified: 2026-11-01T09:42:51Z
level: L1
version: 1.1.0
description: Two desktop features that capture user screen context, one turning a demonstration into a reusable skill and one sending the frontmost window
status: unverified
grounded_in:
  - source: learn.chatgpt.com/docs/extend/record-and-replay (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/appshots (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/managed-configuration (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/customization/computer-history (fetched 2026-11-01)
---

# Record & Replay and Appshots

| | Record & Replay | Appshots |
|---|---|---|
| Platforms | macOS; Computer Use must be enabled [rr] | macOS and Windows desktop app [as] |
| Trigger | Plugins, +, Record a skill; approve the recording request [rr] | Both Command keys (macOS), both Alt keys (Windows), or a custom hotkey [as] |
| Captures | Actions and window content needed to learn the workflow, until stopped [rr] | Frontmost window image plus available text, including off-screen text the app exposes [as] |
| Output | A drafted skill: when to use, inputs, steps, how to verify [rr] | An attachment, stored locally in the session file [as] |
| Reuse | New chat asks for the skill with new values; runs via Computer Use, browser actions, plugins [rr] | Destination Automatic (new chat, or the chat used in the last 60 seconds), Current chat or New chat [as] |
| OS permissions | Not stated; Computer Use must be available and enabled [rr] | macOS: Screen & System Audio Recording for the image, Accessibility for text, under Codex Computer Use; Windows not stated [as] |
| Admin off switch | `[features].computer_use = false` [rr] | `allow_appshots = false` [mc] |

## Notes

- Recording continues until the user stops it from the menu bar, overlay or chat; tips advise short complete
  demonstrations without secrets [rr].
- For Google Docs, Gmail, Sheets and Slides, an appshot may carry only the visible screenshot [as].
- "Voice and Appshots" is one data category for retention review, covering frontmost-window screenshots and
  accessible application text [wls].
- The CLI cannot create appshots; an appshot already in a resumed chat stays in its history [as].
- Recording "observes the actions and window content needed to learn the workflow"; the capture format is not
  documented [rr]. The closest documented sibling, Computer History, turns clicks, typing, shortcuts, app
  switches and macOS accessibility context into text summaries and "does not include screenshots" [ch].

**Inference:** Record & Replay implies a learning-from-demonstration pipeline: event and window capture, then a
model summarises the trace into a natural-language procedure rather than a brittle macro, replayed by the
normal agent loop. A self-built system can start the same way: record input events plus accessibility text
and screenshots, then ask the model to write a skill file.

[rr]: https://learn.chatgpt.com/docs/extend/record-and-replay
[as]: https://learn.chatgpt.com/docs/appshots
[mc]: https://learn.chatgpt.com/docs/enterprise/managed-configuration
[wls]: https://learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security
[ch]: https://learn.chatgpt.com/docs/customization/computer-history
