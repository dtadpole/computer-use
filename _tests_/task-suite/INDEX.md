---
title: Task-suite evaluator tests
created: 2026-11-01T17:24:18Z
modified: 2026-11-01T17:24:18Z
version: 1.0.0
description: The unit suite of the task-suite evaluator - Wilson intervals, plan building, result rows, pass rates that exclude dirty builds, result parsing and token redaction.
grounded_in:
  - source: shared/_conventions_/core-conventions/working-agreements.md@1.5.1 (key functions carry test cases)
---

# Task-suite evaluator tests

| File | Judges |
|---|---|
| [lib.test.mjs](lib.test.mjs) | `wilson`, `buildPlan`, `oracleAnswer`, `resultRow`, `passRates` |
| [run.test.mjs](run.test.mjs) | `parseResult`, `redactTokens`, `buildOf` |

```bash
node --test _tests_/task-suite/*.test.mjs
```

## Read next

[`../INDEX.md`](../INDEX.md).
