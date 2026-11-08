---
title: Human control verifier
created: 2026-11-01T18:33:27Z
modified: 2026-11-01T18:33:27Z
version: 1.0.0
description: Judges the ULTIMATE_GOAL human-control row through the live view's own HTTP surface - pause, take over with a person's click, hand back, stop, and what the watch token may not do - from the input recorder, and proves it fails on four broken builds.
grounded_in:
  - source: _tools_/live-view/INDEX.md
  - source: _context_/team-operations/decision-log.yaml (D-012, D-014)
---

# Human control verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | the claims and the mutant each catches |
| [check.mjs](check.mjs) | one live run; five checks in order, ending with stop |
| [mutants.mjs](mutants.mjs) | `pause-ignored`, `take-over-ignored`, `hand-back-ignored`, `input-without-takeover` |
| [verify.sh](verify.sh) | the entry point; `CU_VERIFY_SUT` points it at another build |

| Run, 2026-11-01, agent-core 6a4fd0877, live-view 22514a095 | Verdict |
|---|---|
| the build | 0, all 5 checks |
| mutant proof | 4 of 4 caught, each by its own check |

## Read next

[`../INDEX.md`](../INDEX.md).
