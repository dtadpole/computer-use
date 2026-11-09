---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-09T22:44:10Z
level: L1
version: 4.12.0
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: the repository replacement of 2026-11-08 (new main 6314c0c; old PR numbers name the private history)
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## Open PRs - one stack, landed back to back in this order (cu-coordinator 20:39Z)

1. #369, Fixes CU-368: a same-origin frame editor's body is a text entry.
2. #339, Fixes CU-357: an effect reports the session's notices.
3. #355, Part of CU-360: another app's scheme is a notice; `noticeOf` keeps reason, stop, launched.
4. #299, Part of CU-336: an unread iframe name comes from aria-labelledby, aria-label or title.
5. #393, Part of CU-373: a toggle's `checked`/`pressed` reaches the target.
6. #402, Ref CU-370: an ARIA listbox's active option falls back to aria-selected; multiselectable is unread.

Each is merged on the one below; a landing that moves main into a conflict means re-stacking and one re-OK round.
After #299: the `__privateStripeFrame5` policy row (local commit). After #339: the page-WebSocket lifetime fix.

## Issues

In Progress: CU-357, CU-360, CU-368. Verify: CU-370 and ten more.

## Live state

Schedules: the hourly pass and the 23:00Z reflection. D-102 suites run through a script that checks the run-lock
before every step and stops while a gate holds it.

## Lessons

- Read the inbox for an open GATE PHASE 2 before any suite, and guard the run itself (22:17Z slip).
- Set CU_VERIFY_SEAT on local verifier runs.
- A probe through the real loop finds where a fix really sits (CU-370's Enter: the loop, not the driver).
- D-097: run the gate unpiped, then `&& git push`.
