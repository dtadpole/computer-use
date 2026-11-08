---
title: '[cu] Developer Two - browser environment behaviour proposal'
created: 2026-11-01T09:36:00Z
modified: 2026-11-05T16:22:58Z
level: L1
version: 1.0.1
description: 'How the proposed browser environment executes actions, filters sites, handles popups and dialogs, isolates Chrome and refuses work - the runtime rules behind the M1 interface proposal.'
status: unverified
grounded_in:
  - source: _context_/chatgpt-computer-use/api-action-handling.md@1.0.0
  - source: _context_/chatgpt-computer-use/safety-isolation-and-approvals.md@1.0.0
  - source: _context_/team-operations/decision-log.yaml (D-005)
related_to:
  - ref: headless-chrome-measurements.md@1.4.0
    as: depends
---

# Browser environment behaviour (proposal)

Companion to the [interface proposal](environment-interface-proposal.md).

## Actions

- **Coordinates.** Pointer coordinates and scroll deltas arrive in frame pixels and are divided by `frame.scale`,
  fixed per run. A point outside `[0, width) x [0, height)` is refused, never clamped.
- **Keys.** Canonical names are W3C `KeyboardEvent.key` values (`Control`, `Enter`, `ArrowLeft`, `a`). Letters in
  `keypress` are case-insensitive and upper case only with `Shift`, since OpenAI emits upper-case names. `Control`
  or `Meta` with A or Z map to the editing commands `selectAll` and `undo` (`redo` with Shift).
- **Clipboard.** Copy, cut and paste (C, X, V chords) are refused until a check, which needs the coordinator's
  consent because it touches the owner's pasteboard, shows the headless clipboard is separate.
- **Held keys.** Pressed before the mouse action, carried in its bitmask, released in reverse order in a `finally`.
- **`type`.** US-keyboard characters become key events, `\n` becomes Enter, the rest goes through `Input.insertText`.
- **`drag`.** Move to the first point, press, move through each point, release; HTML5 drag-and-drop may need
  `Input.setInterceptDrags`.
- **`scroll`.** Move, then `mouseWheel`; Anthropic's clicks become 100 px each in the adapter.
- **`wait`.** 1000 ms default, capped at 10 s, aborted by `signal`.
- **Settle.** 60 ms after each input; a navigation it started is awaited up to 5 s; `screenshot` first waits two
  animation frames.

## Boundaries

- **Site filter.** One browser-level `Fetch` handler asks `sitePolicy` about every request. Floor rules hold
  regardless: `file:`, `chrome:`, `devtools:` and `javascript:` navigations and the live-view origin are denied
  (R32). Downloads, file choosers and permission prompts are denied.
- **Popups.** A new page with an opener becomes the foreground for screenshots and input; closing it returns to the
  opener.
- **Dialogs.** Headless screenshots do not show them. `alert` is accepted and recorded; `confirm`, `prompt` and
  `beforeunload` are held, reported in `state().dialog` and the effect as a consent point, and input is refused
  with `dialog_open` meanwhile.
- **Isolation (R1).** Fresh profile `/tmp/<seat>-chrome-*`; child environment of `PATH`, `HOME`, `TMPDIR` inside
  the profile; `--use-mock-keychain` (no Keychain prompt); extensions, sync, background networking and component
  updates off; Chrome's sandbox on.
- **Resources (D-005).** Launch refuses below 25% free memory, a second browser for the seat or a third for the
  team, counted by pid files under `/tmp`.
- **Error codes.** `invalid_argument`, `unsupported_action`, `blocked_by_policy`, `dialog_open`, `human_in_control`,
  `cancelled`, `timeout`, `browser_crashed`, `closed`, `resource_refused`.
