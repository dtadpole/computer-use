---
title: Agent loop claims
created: 2026-11-01T17:45:00Z
modified: 2026-11-01T18:53:58Z
level: L1
version: 1.1.0
description: What the agent-loop verifier claims - a scripted run completes a fixture task by page state, every bound stops page events at the bound with nothing after, a harness stop ends the run, and the Claude adapter parses wire responses into canonical actions.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@1.0.0 (agent loop row)
  - source: _designs_/system-architecture/goal-checks.md@0.8.0 (agent-loop seed)
  - source: _designs_/system-architecture/run-outcomes.md (bounds table)
---

# Claims

Runs go through `startRun`, the composition root cli.mjs uses, with the scripted model. Evidence: the fixture's
state and the input recorder's press count; for requests, the scripted plan's own call count.

| # | Claim | Mutant it catches |
|---|---|---|
| L1 | A scripted run completes `visitor-badge`; the fixture state holds and `judgeRun` says pass | - |
| L2 | `maxSteps` 3: three model requests, two batches on the page (run-outcomes: the last request's call is recorded, not executed), none after | `steps-unbounded` |
| L3 | `maxCostUsd` 0.05 at 0.02 a turn: three batches, then `max_cost`, none after | `cost-ignored` |
| L4 | `maxWallMs` 1.5 s: `max_time` near the bound, none after | - |
| L5 | A stop from the harness ends the run `cancelled`; no press follows | `stop-ignored` |
| L6 | `parseTurn` maps wire fixtures to canonical actions, final turns and usage; an unknown tool is refused by name | `parse-right-as-left` |
| L7 | `parseResponsesTurn` maps OpenAI's documented `call_002` batch in order, keeps pending safety checks, and reads a message as the final turn | `responses-drops-batch` |

## Read next

[`INDEX.md`](INDEX.md).
