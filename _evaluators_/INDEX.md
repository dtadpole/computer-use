---
title: computer-use evaluators
created: 2026-11-01T17:24:18Z
modified: 2026-11-02T08:53:40Z
version: 1.1.0
description: The computer-use project's _evaluators_ type folder - machinery that runs the agent on the fixture suite and records judged attempts and pass rates while the work is in progress.
grounded_in:
  - source: shared/_conventions_/core-conventions/type-vocabulary.md
  - source: _context_/evaluation-design/r58-measurement.md
---

# `_evaluators_`

| Instance | What it does |
|---|---|
| [`task-suite/`](task-suite/INDEX.md) | runs fixture tasks through `cli.mjs`, judges each attempt from fixture state, appends `results.jsonl`, reports pass rates per model and clean build |
| [`desktop-suite/`](desktop-suite/INDEX.md) | the CU Fixture tasks and injection screens through `--env macos-desktop`, rates per model and build |

Owner: cu-verifier. Verdicts here rest on the fixture alone (D-012).

## Read next

[`../INDEX.md`](../INDEX.md).
