---
title: Desktop agent loop claims
created: 2026-11-02T09:38:37Z
modified: 2026-11-02T09:38:37Z
level: L1
version: 0.1.0
description: What the desktop-agent-loop verifier claims through real agent-core runs on the fake helper - malformed batches post nothing, and runs are bounded in steps and time and cancellable at once.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0 (agent loop row)
  - source: _designs_/desktop-extension/agent-core-changes.md@0.3.2
---

# Claims

| # | Claim | Mutant that must fail it |
|---|---|---|
| L1 | A batch with an action the driver could not run (unknown key, 150-point drag, repeat 500, key without a macOS code, 60 s wait) is refused whole; its first click never reaches the helper | no-batch-validation |
| L2 | The step bound ends the run as max_steps; the call over the bound is recorded, not run | steps-unbounded |
| L3 | A cancel during a 4 s wait ends the run as cancelled within 3 s; the next action never runs | stop-ignored (the loop's cancel paths are redundant: removing one checkpoint is not caught, rightly) |
| L4 | The wall-time bound ends the run as max_time before the next action | time-unbounded |

One run control is shared by driver and loop, as startRun shares it. Multiple models are the live half: the
desktop suite's rates per model and build.

## Read next

[INDEX.md](INDEX.md).
