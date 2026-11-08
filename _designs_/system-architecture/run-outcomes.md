---
title: Run bounds, cancellation and outcomes
created: 2026-11-01T09:24:10Z
modified: 2026-11-05T16:23:12Z
level: L1
version: 0.7.1
description: The step, time and cost bounds of a run, how cancellation behaves, the closed set of run statuses and the result object a caller receives.
status: unverified
grounded_in:
  - source: _context_/chatgpt-computer-use/api-sdk-computer-toolset.md@1.0.0
  - source: ULTIMATE_GOAL.md@1.0.0
---

# Bounds, cancellation and outcomes

## Bounds (R22)

| Bound | Default | Checked |
|---|---|---|
| `maxSteps` (model requests) | 20 | before each request; a call returned by the last allowed request is recorded, not executed |
| `maxWallMs` | 600000 (10 min) | at every checkpoint; also the deadline of model requests and driver calls |
| `maxCostUsd` | 1.00 | before each request, from adapter usage; with no price configured, `maxTokens` (default 400000) applies instead |
| `maxActionsPerCall` | 20 | in validation |
| `consentTimeoutMs` | 300000 | an unanswered consent request is a decline |

Live runs on the gateway keep these caps or lower (D-007). Waiting for a human counts toward wall time only
while the run is not paused or taken over, so a person thinking does not burn the budget.

## Cancellation

`signal` abort and the `stop` command behave the same: a model request in flight is aborted, a driver action in
flight completes (it cannot be undone), no further action starts, one final screenshot is taken and the result
lists what ran (R38). `close()` on the environment always runs.

## Statuses

| Status | When |
|---|---|
| `completed` | the model gave a final answer |
| `needs_input` | the model asked the user and no attended controller answered |
| `escalated` | the model called `escalate` or the inspector flagged content, and no person chose to continue |
| `declined` | a human or the controller declined a provider safety check |
| `cancelled` | stop or `signal` |
| `max_steps`, `max_time`, `max_cost` | a bound was reached |
| `refused_by_model` | the model refused or ran out of output |
| `refused_by_policy` | task screening refused the task before any action |
| `error` | driver crash, adapter failure after retries, script exhausted |

`completed` is the model's claim, not success: the verifier judges success from the fixture's state endpoint
(R48).

## Result

```
{ runId, status, finalMessage, steps, actions: { done, refused, blocked, declined, skipped, failed },
  usage: { inputTokens, outputTokens, costUsd }, finalScreenshot, trajectoryDir, replayUrl, startedAt, endedAt }
```

`finalScreenshot` is a path in the run directory; `replayUrl` is set only while the live view serves, so the result
also carries the durable `replayCommand` (`cli.mjs replay <run-id>`). A session never runs the CLI in a blocking
call, since a run may last `maxWallMs`: it starts it as a background job or through the M4 tool. The CLI prints
the result as JSON and exits 0 for `completed`, 2 for `needs_input`, `escalated` or `declined`, 1 otherwise.
