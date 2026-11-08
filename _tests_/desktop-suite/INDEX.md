---
title: Desktop suite tests
created: 2026-11-02T08:53:40Z
modified: 2026-11-05T12:37:03Z
version: 0.2.0
description: Plumbing tests for the desktop suite evaluator with a stub agent that acts only through the fixture channel and is never rated.
grounded_in:
  - source: _evaluators_/desktop-suite/INDEX.md
---

# Desktop suite tests

| File | What it covers |
|---|---|
| [lib.test.mjs](lib.test.mjs) | apps per task, task choice, pass and fail attempts offscreen, the two-app attempt, desktop detection in the CLI; `--input-mode` reaches the CLI only when given and is recorded on every row |

## Read next

[../../_evaluators_/desktop-suite/INDEX.md](../../_evaluators_/desktop-suite/INDEX.md).
