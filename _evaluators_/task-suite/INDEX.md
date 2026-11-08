---
title: Task-suite evaluator
created: 2026-11-01T17:24:18Z
modified: 2026-11-01T17:58:06Z
version: 1.2.0
description: Runs fixture tasks through agent-core's command line with the scripted model or a live Claude model, judges every attempt from fixture state, and keeps one results.jsonl row per attempt with pass rates per model and clean build.
grounded_in:
  - source: _context_/evaluation-design/r58-measurement.md
  - source: _context_/team-operations/decision-log.yaml (D-012, D-014, D-016)
---

# Task-suite evaluator

| File | What it is |
|---|---|
| [run.mjs](run.mjs) | the harness: fresh state, `cli.mjs run` in a child process, verdict from `judgeRun`; `--summary` prints rates |
| [lib.mjs](lib.mjs) | plan building, result rows, pass rates with Wilson 95 percent intervals |
| [results.jsonl](results.jsonl), [results/](results/INDEX.md) | one row per attempt, R58 field names; other seats land their batches as `results/<date>-<seat>-<label>.jsonl` |

`--controller approve|decline|unattended` runs each attempt in-process through `startRun`, answering agent-core's
api controller as the person (approve only the task's own consent classes) and keeping every request as
`consentEvents`; `escalated` means a request came from the model, inspector or provider. `--seat` registers the
browser under another seat; `--tasks all|tasks|injections` picks the suite. Scripted plans are the oracle replayed in this evaluator's own 1440x900 browser. A row is rated only when git and
the run's own record both say clean. Stored text is token-redacted. Live batches are announced under D-016 caps.

```bash
node _evaluators_/task-suite/run.mjs --model scripted
node _evaluators_/task-suite/run.mjs --summary
```

| Batch, 2026-11-01, build a1825fca5 clean, seed m2-acceptance | Pass | Cost USD |
|---|---|---|
| scripted | 3 of 3 | 0 |
| claude-gateway/model-a | 3 of 3, Wilson 0.44 to 1 | 0.109 |
| claude-gateway/claude-sonnet-5-5 | 3 of 3, Wilson 0.44 to 1 | 0.050 |

Suite: [`_tests_/task-suite/`](../../_tests_/task-suite/INDEX.md).

## Read next

[`../INDEX.md`](../INDEX.md).
