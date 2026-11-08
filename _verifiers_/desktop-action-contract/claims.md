---
title: Desktop action contract claims
created: 2026-11-02T09:25:25Z
modified: 2026-11-05T12:41:51Z
level: L1
version: 0.3.0
description: What the desktop-action-contract verifier claims - the macos-desktop driver turns each GA action into the right helper events, releases everything it presses, and refuses unsupported actions by name with nothing sent.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0 (action contract row)
  - source: _designs_/desktop-extension/input-and-targets.md@0.3.2
---

# Claims

| # | Claim | Mutant that must fail it |
|---|---|---|
| C1 | A click is move, down and up at its point; the right button stays right | click-no-up |
| C2 | Double and triple clicks count 1, 2 (, 3) | double-click-count-1 |
| C3 | Move posts a move only; drag holds the button along the path and releases at its end | click-no-up (shared release rule) |
| C4 | Scroll posts a wheel event at the point in CGEvent's sign | scroll-sign |
| C5 | A chord's key carries its modifier flags, and every key comes up | chord-no-command |
| C6 | Typed text arrives whole across chunk edges; a newline is one Enter press | type-trims |
| C7 | Wait sends nothing; a screenshot sends no input | - |
| C8 | navigate and an unknown action are refused by name, nothing sent | navigate-accepted |
| C8b | Command-A, and copy, cut and paste chords (D-031), go to the helper as Command chords: Command down with its flag, the main key down and up with it, Command up | clipboard-chord-refused |

Evidence is the events the fake helper received. The batch half (a batch with a driver-refused action posts
nothing) waits for agent core's desktop policy (C5); the gap is raised with cu-developer-one and cu-developer-two.

## Read next

[INDEX.md](INDEX.md).
