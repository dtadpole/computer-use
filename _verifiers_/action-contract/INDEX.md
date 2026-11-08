---
title: Action contract verifier
created: 2026-11-01T17:25:00Z
modified: 2026-11-01T17:25:00Z
version: 1.0.0
description: Judges the ULTIMATE_GOAL action-contract row from the input recorder's event log - every GA action, held keys released even after a failure, a bad batch refused whole by the loop - and proves it fails on four broken builds.
grounded_in:
  - source: _designs_/system-architecture/goal-checks.md@0.8.0
  - source: _context_/team-operations/decision-log.yaml (D-012, D-014)
---

# Action contract verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | the claims and the mutant each catches |
| [check.mjs](check.mjs) | Part A: 10 checks on the driver; Part B: 3 scripted runs of agent-core's loop |
| [mutants.mjs](mutants.mjs) | `batch-partial`, `modifiers-held`, `drag-without-button`, `right-is-left` |
| [verify.sh](verify.sh) | the entry point; `CU_VERIFY_SUT` points it at another build |

| Run, 2026-11-01, agent-core 8fb45b5e5, chrome-browser 29050c161 | Verdict |
|---|---|
| the build | 0, all 13 checks, 21 s |
| first mutant proof | 2 of 4 caught: a CDP mouse event carries its own modifiers, so a never-released Shift looked clean; the batch mutant crashed the loop instead of running half the batch. Both fixed: the check now pairs every modifier keydown with its keyup, and the mutant keeps the valid part of a refused batch |
| second mutant proof | 4 of 4 caught, each by its own check |

## Read next

[`../INDEX.md`](../INDEX.md).
