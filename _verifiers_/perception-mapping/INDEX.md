---
title: Perception mapping verifier
created: 2026-11-01T17:25:00Z
modified: 2026-11-01T17:25:00Z
version: 1.0.0
description: Judges the ULTIMATE_GOAL perception row - the model's image shows each target where a click on that frame point lands, within one CSS pixel at scale 1 and 0.75 - and proves it fails on three broken builds.
grounded_in:
  - source: _designs_/system-architecture/goal-checks.md@0.8.0
  - source: _context_/team-operations/decision-log.yaml (D-012, D-014)
---

# Perception mapping verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | the claims, their evidence, the mutant each catches |
| [check.mjs](check.mjs) | one driver launch per scale; PNG pixel plus the recorder's press |
| [mutants.mjs](mutants.mjs) | `no-unscale`, `off-by-two`, `screenshot-misscaled` |
| [verify.sh](verify.sh) | the entry point; `CU_VERIFY_SUT` points it at another build |

| Run, 2026-11-01, chrome-browser 29050c161 | Verdict |
|---|---|
| the build | 0, both scales, 6 s |
| `no-unscale` | 1: scale 0.75 fails, scale 1 holds, as it should |
| `off-by-two`, `screenshot-misscaled` | 1: both scales fail |

## Read next

[`../INDEX.md`](../INDEX.md).
