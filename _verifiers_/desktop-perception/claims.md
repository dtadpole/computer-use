---
title: Desktop perception claims
created: 2026-11-02T09:21:10Z
modified: 2026-11-02T09:21:10Z
level: L1
version: 0.1.0
description: What the desktop-perception verifier claims - the macos-desktop driver maps screenshot points back to global points within one point on scale-1, Retina and secondary displays, refuses out-of-frame clicks, and captures zoom regions where the screenshot shows them.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0 (perception row)
  - source: _designs_/desktop-extension/capture-and-scaling.md@0.3.1
---

# Claims

| # | Claim | Mutant that must fail it |
|---|---|---|
| D1 | A click on a screenshot point reaches the helper within one point of where the display geometry puts it, on scale-1, Retina and a secondary display left of and above the main one, under two adapters' image limits | no-unscale, no-origin, off-by-two |
| D2 | A click outside the screenshot is refused and nothing is sent | no-bounds |
| D3 | A zoom region is captured where the screenshot shows it (within one point) | zoom-unscaled |

Expected points come from the declared geometry and the decoded screenshot size only; observed points from the
helper's request log. Retina is declared (this Mac has one scale-1 display). The live half - CU Fixture logging
the landing point of a real click - follows the owner's grant.

## Read next

[INDEX.md](INDEX.md).
