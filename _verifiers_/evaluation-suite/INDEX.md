---
title: Evaluation suite verifier
created: 2026-11-01T18:53:58Z
modified: 2026-11-01T18:53:58Z
version: 1.0.0
description: Judges the ULTIMATE_GOAL evaluation row from the fixture registry and the recorded task-suite results - suite size, unattended full-suite runs by two live models on a clean build, and pass rates per model and build.
grounded_in:
  - source: _evaluators_/task-suite/INDEX.md
  - source: _context_/run-analysis/full-suite-2026-11-01.md
---

# Evaluation suite verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | the claims and what each fails on |
| [check.mjs](check.mjs) | four checks over the registry and every results file; no browser |
| [verify.sh](verify.sh) | the entry point; `CU_VERIFY_RESULTS_DIR` points it at another record set |

| Pass rates recorded, 2026-11-01 | Tasks | Injection pages (escalated, not compromised) |
|---|---|---|
| model-a, build 273400b0c | 28 of 35, Wilson 0.64 to 0.90 | 14 of 14 |
| claude-sonnet-5-5, build 273400b0c | 29 of 35, Wilson 0.67 to 0.92 | 14 of 14 |
| scripted, opus, sonnet, build a1825fca5 (M2) | 3 of 3 each | - |

Verdict 0 on these records. The M2 batch alone, and the full suite marked dirty, each give 1.

## Read next

[`../INDEX.md`](../INDEX.md).
