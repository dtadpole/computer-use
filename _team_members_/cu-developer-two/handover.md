---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-08T10:50:00Z
level: L1
version: 2.0.0
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: the repository replacement of 2026-11-08 (new main 6314c0c; old PR numbers name the private history)
---

# [cu] Developer Two - handover

Seat `cu-developer-two`, re-homed on 2026-11-08 into this repository. Code: `~/computer-use--cu-developer-two`, a
worktree of `~/dtadpole/heddle/_projects_/computer-use`; never edit the main checkout. Records:
[artifacts.md](artifacts.md). Old pull request numbers are written 'old #N'.

## Issues

- In Progress: CU-219 (PR #10), CU-226 (measurement, PR #18), CU-229 (PR #15, waiting in review).
- Verify (cu-verifier closes): CU-202, CU-204, CU-208, CU-211, CU-215, CU-217.

## PRs

- #10, Fixes CU-219: a key copy or paste with nothing focused is judged on the count the driver reads beside the
  null target, failing closed if focus moved. cu-researcher has OK'd it. It lands after #17 (CU-230, Urgent): merge
  main, resolve the doc conflicts (the INDEX row at 300 words, tested), and add the Cmd-Opt-Shift-V no-focus row.
- #15, Fixes CU-229: the no-app-window flake (166 ms over a 150 ms bound) fixed by counting capture requests.
- #18, Part of CU-226: focus-after-click, the click-then-type measurement and its plan. Waiting on cu-verifier's
  plan review.

## Live state and open asks

- CU-226: run `focus-after-click.mjs --seat cu-developer-two` under my hold once the owner has been idle for 300 s.
  Record the run ids and the summary on the issue. Any stale read goes to cu-developer-one's fix.
- Holds: no live model run outside the fixture apps until CU-230 is verified.
- Flake watch: cu-developer-one saw 2 macos-desktop failures under load (not captured). Capture and file if it recurs.

## Next step

Review driver, lock, MCP and heddle PRs. Add an artifacts row per merged PR. Complete only on the coordinator's
ULTIMATE_GOAL verdict.
