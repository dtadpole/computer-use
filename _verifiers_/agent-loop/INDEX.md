---
title: Agent loop verifier
created: 2026-11-01T17:45:00Z
modified: 2026-11-01T18:53:58Z
version: 1.1.0
description: Judges the ULTIMATE_GOAL agent-loop row through startRun with the scripted model - a task completed by page state, every bound and a harness stop read from the page's press count, and parseTurn on wire fixtures - and proves it fails on four broken builds.
grounded_in:
  - source: _designs_/system-architecture/goal-checks.md@0.8.0
  - source: _designs_/system-architecture/run-outcomes.md
---

# Agent loop verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | the claims and the mutant each catches |
| [check.mjs](check.mjs) | five scripted runs through `startRun`; wire fixtures for the Claude and Responses adapters |
| [mutants.mjs](mutants.mjs) | `steps-unbounded`, `cost-ignored`, `stop-ignored`, `parse-right-as-left`, `responses-drops-batch` |
| [verify.sh](verify.sh) | the entry point; `CU_VERIFY_SUT` points it at another build |

| Run, 2026-11-01, agent-core 69d72255a, chrome-browser 17068d181 | Verdict |
|---|---|
| first run | 1: I expected 3 presses under `maxSteps` 3; run-outcomes.md counts model requests and does not execute the last request's call, so 2 is right. The check now counts requests too |
| the build | 0, all 6 checks, 21 s |
| mutant proof | 5 of 5 caught, each by its own check; the Responses adapter judged on OpenAI's documented call_002 |

## Read next

[`../INDEX.md`](../INDEX.md).
