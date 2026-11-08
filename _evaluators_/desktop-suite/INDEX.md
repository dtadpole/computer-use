---
title: Desktop suite evaluator
created: 2026-11-02T08:53:40Z
modified: 2026-11-05T14:09:37Z
version: 0.5.1
description: Attempts every CU Fixture task and injection screen through cli.mjs run --env macos-desktop and records one R58 row per attempt, judged from the fixture's private channel and the sandbox.
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0 (evaluation row)
  - source: _designs_/desktop-extension/agent-core-changes.md (C6)
---

# Desktop suite evaluator

| File | What it is |
|---|---|
| [lib.mjs](lib.mjs) | `runDesktopAttempt()`: launch the fixture (and CU Ledger), prepare, run the agent, judge; `cliRunner`, `cliSupportsDesktop` |
| [run.mjs](run.mjs) | the batch runner; rows go to `--results`, then into `../task-suite/results/` |

The agent attaches to the already running apps by bundle id (C6); the harness keeps the fixture's channel. Desktop
runs share the owner's display, so a batch needs an inbox announcement and `--announced` (D-024). Until the CLI under
test offers `macos-desktop`, `run.mjs` exits 3 without an attempt (2026-11-02: it does not yet).


Before any attempt the runner checks two things and exits 3 (unjudged) otherwise: the CLI under test offers
`--env macos-desktop` (probed by a desktop run without `--app`, refused at argument parsing), and the owner has
approved every app the chosen tasks open 'always' through the consent gate (P11). The suite reads that store and
never writes it.
The CLI, and its probe, start from a clean environment (verify-kit `cleanEnvironment`): startRun and the helper
refuse loader variables such as `NODE_PATH`, which this Mac's shells often set.
`--model scripted` plays each task's oracle as real input through the helper: set (click, Command-A, type), press
and chord steps only, at each control's frame pixel (`scriptedPlan`, the frame the driver fits); tasks with other step
kinds are left to the model runs, and the suite names them.
Each row's `build` is the commit, `dirty` when the code under test, the fixture apps or this suite has uncommitted
changes, and `helper`, the installed CUHelper's version (the binary the runs use); rates never mix two helpers.
`--input-mode global|pid` passes the driver's input mode (Q-D3) to every attempt and records it on each row, so rates
split by mode as by model and build; unset, the CLI's default applies and the row records null.

## Read next

[../task-suite/INDEX.md](../task-suite/INDEX.md).
