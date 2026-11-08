---
title: Trajectory and replay verifier
created: 2026-11-01T18:15:00Z
modified: 2026-11-01T18:15:00Z
version: 1.0.0
description: Judges the ULTIMATE_GOAL trajectory row - a secret typed by reference never reaches the run's files, replay matches the page's clicks, and a SIGKILLed CLI run leaves a readable record - and proves it fails on three broken builds.
grounded_in:
  - source: _designs_/system-architecture/goal-checks.md@0.8.0
  - source: _context_/team-operations/decision-log.yaml (D-005, D-012)
---

# Trajectory and replay verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | the claims and the mutant each catches |
| [check.mjs](check.mjs) | a sign-in run, a replayed run, and a CLI run killed with SIGKILL |
| [mutants.mjs](mutants.mjs) | `events-buffered`, `secret-resolved-in-place`, `replay-drops-actions` |
| [verify.sh](verify.sh) | the entry point; `CU_VERIFY_SUT` points it at another build |

| Run, 2026-11-01, agent-core 7c0d501a1 | Verdict |
|---|---|
| first runs | 1, all mine: the person must approve the credential class; a refused launch looked like a failure; the killed CLI's Chrome outlived cleanup; mutants lacked live-view and ran from `/tmp`'s link path, so their CLI did nothing |
| the build, twice | 0, all 3 checks |
| mutant proof | 3 of 3 caught, each by its own check |

## Read next

[`../INDEX.md`](../INDEX.md).
