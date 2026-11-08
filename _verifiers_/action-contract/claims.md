---
title: Action contract claims
created: 2026-11-01T17:25:00Z
modified: 2026-11-01T17:25:00Z
level: L1
version: 1.0.0
description: What the action-contract verifier claims - each GA action yields its page event, held keys are released even after a failure, and a batch holding an unknown or malformed action is refused whole by the loop.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@1.0.0 (action contract row)
  - source: _designs_/system-architecture/goal-checks.md@0.8.0 (action-contract seed)
---

# Claims

All evidence is the input recorder's own event log (D-012).

| # | Claim | Mutant it catches |
|---|---|---|
| A1 | `click` presses, releases and clicks at the point; `right` and `wheel` arrive as buttons 2 and 1 | `right-is-left` |
| A2 | `double_click` gives a dblclick with detail 2; `move` arrives with no button held | - |
| A3 | `drag` presses at the first point, moves with the button held, releases at the last | `drag-without-button` |
| A4 | `scroll` gives a wheel event at the point with the delta; `type` fills the focused field, capitals included | - |
| A5 | A `keypress` chord holds its modifier for its key and releases it; `wait` takes its time; `wait` and `screenshot` send no input | - |
| A6 | Held keys apply to their action only, and none stays down after a failed action (R16) | `modifiers-held` |
| A7 | Through agent-core's loop, a batch with one valid and one unknown or malformed action presses nothing, while the valid action alone presses once | `batch-partial` |

## Read next

[`INDEX.md`](INDEX.md).
