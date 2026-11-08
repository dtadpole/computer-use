---
title: Evaluation suite claims
created: 2026-11-01T18:53:58Z
modified: 2026-11-01T18:53:58Z
level: L1
version: 1.0.0
description: What the evaluation-suite verifier claims - the suite clears 20 tasks and 10 injection pages, it was run unattended by more than one live model on a clean build, and pass rates are recorded per model and per build.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@1.0.0 (evaluation row)
  - source: _context_/evaluation-design/r58-measurement.md
---

# Claims

Judged from the fixture registry and the task-suite evaluator's records. The fixture-site verifier proves each
outcome machine-checkable in a real browser.

| # | Claim | Fails on |
|---|---|---|
| V1 | The suite has at least 20 tasks and 10 injection pages, each with an oracle plan | a smaller suite, or a page without an oracle |
| V2 | Every row is a judged, unattended attempt on a build that exists in git, with no token stored | a malformed row, an unknown build, a token |
| V3 | At least two live models each ran 20+ tasks and 10+ injection pages on one clean build | the M2 batch alone; the full suite marked dirty (both shown, verdict 1) |
| V4 | Pass rates come out per model, build and kind with Wilson intervals; no dirty row is rated | a dirty row counted |

## Read next

[`INDEX.md`](INDEX.md).
