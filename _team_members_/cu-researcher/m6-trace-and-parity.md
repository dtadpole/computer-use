---
title: M6 desktop design - requirement trace and product parity review
created: 2026-11-02T09:15:49Z
modified: 2026-11-05T16:26:33Z
level: L1
version: 1.0.1
description: The researcher's trace of desktop design 0.2.0 against requirements R63 to R97 and its parity review against ChatGPT and Anthropic desktop computer use, with the changes asked for.
status: unverified
grounded_in:
  - source: dtadpole/computer-use/_designs_/desktop-extension/INDEX.md (0.2.0, 8a8d98fd9)
  - source: _context_/chatgpt-computer-use/implications-desktop-scope-and-perception.md
  - source: _context_/chatgpt-computer-use/implications-desktop-action-and-safety.md
  - source: _context_/desktop-computer-use/computer-vs-browser-use.md
  - source: learn.chatgpt.com/docs/computer-use
  - source: support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork
---

# M6 trace and parity review

## Trace (R63 to R97, design 0.1.4, rechecked on 0.2.0)

| Level | Covered | Partial | Missing | Conflicts |
|---|---|---|---|---|
| MUST (27) | 13 | 12 | 0 | 2 |
| SHOULD (7) | 0 | 2 | 5 | 0 |
| MAY (1) | 0 | 0 | 1 | 0 |

Conflicts: **R86**, buttons and modifiers can stay pressed after pause or stop; **R83**, a secure field is class
`credential`, confirmable and pre-approvable, where the requirement says hand it to the person. Sent to the
developers and the coordinator (inbox 20261102T090122).

## Parity (30 product behaviours)

Equal 6, ours stricter 10, ours weaker 8, missing 4, not applicable 2 (Locked use, enterprise admin).

| Rank | Gap | Change asked |
|---|---|---|
| 1 | Background operation: both products act without taking the pointer; ours defaults to global input and any touch pauses | `ax` first, then `pid`, then `global`; capture the target window alone; in background runs only input aimed at the target pauses |
| 2 | Held keys after an interruption (R86) | the helper tracks what it holds and posts tagged up events on pause, stop, failure or socket loss |
| 3 | Keyboard-only and disruptive actions are unclassed | a chord table (block, confirm delete, confirm submit), a `disruptive` class, AXManualAccessibility for Electron |
| 4 | No click-only tier for IDEs; an IDE terminal bypasses the terminal exclusion (R67) | tiers view, click, full; IDEs capped at click |
| 5 | File dialogs uncovered | measure first (a new open question), then treat an attached panel as the host app's scope with a `file_access` confirm and refuse key stores |

Next: a run indicator with Stop on the Mac (R94), ask before taking the foreground and restore the person's app,
a persistent "never" per app, default-blocked sensitive app categories, on-device text recognition for pixel-only
injection, a warning for broad-reach apps such as Finder.

Deliberately stricter: clipboard untouched, extra exclusions, the local-input pause, approvals scoped to one run,
one display per run.

Gaps 1 to 3 and 5 touch safety, so under D-027 they may reopen M6 rather than fold as 0.2.x; that is the
coordinator's ruling. Quotes not yet in the source register (Anthropic's session approval limit and broad-reach
warning, ChatGPT's always-allowed apps and managed configuration) join it in its next revision.

## Read next

[INDEX.md](INDEX.md).
