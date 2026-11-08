---
title: Trajectory and replay claims
created: 2026-11-01T18:05:00Z
modified: 2026-11-01T18:05:00Z
level: L1
version: 1.0.0
description: What the trajectory-replay verifier claims - a secret typed by reference never reaches the run's files, the replay lists exactly what the page saw, and a run killed mid-way leaves a record that reads back.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@1.0.0 (trajectory row)
  - source: _designs_/system-architecture/goal-checks.md@0.8.0 (trajectory-replay seed)
---

# Claims

Evidence: the fixture's login record and input recorder (D-012), and the bytes of every file in the run directory.

| # | Claim | Mutant it catches |
|---|---|---|
| T1 | A password typed as `{{secret:NAME}}` signs in (the fixture logs the login) and appears in no file of the run directory, screenshots included | `secret-resolved-in-place` |
| T2 | `cli.mjs replay` of a finished run lists as many completed clicks as the input recorder saw, and its result | `replay-drops-actions` |
| T3 | A `cli.mjs run` killed with SIGKILL leaves `run.json` and `events.jsonl` that read back, with no result and the clicks the page saw | `events-buffered` |

The killed run's Chrome cannot stop itself, so the check kills it by profile path and asserts none is left.

## Read next

[`INDEX.md`](INDEX.md).
