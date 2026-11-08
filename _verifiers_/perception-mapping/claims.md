---
title: Perception mapping claims
created: 2026-11-01T17:25:00Z
modified: 2026-11-01T17:25:00Z
level: L1
version: 1.0.0
description: What the perception-mapping verifier claims - the screenshot is at the declared resolution, shows each target at the frame point the model would click, and a click there lands on that target within one CSS pixel, at scale 1 and 0.75.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@1.0.0 (perception row)
  - source: _designs_/system-architecture/goal-checks.md@0.8.0 (perception-mapping seed)
---

# Claims

| # | Claim | Outside evidence | Mutant it catches |
|---|---|---|---|
| P1 | At scale 1 and 0.75 the screenshot is the viewport times the scale | the PNG header | `screenshot-misscaled` |
| P2 | The model's image shows each target's red at `round(css * scale)` | the decoded PNG pixel | `screenshot-misscaled` |
| P3 | A click at that frame point presses the intended target, within 1 CSS pixel of its odd-pixel centre | the input recorder's event log (target and clientX, clientY) | `no-unscale`, `off-by-two` |

Targets come from the input recorder probe, seeded at odd CSS coordinates so a half-pixel rounding error shows.

## Read next

[`INDEX.md`](INDEX.md).
