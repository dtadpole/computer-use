---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-08T18:56:00Z
level: L1
version: 3.1.0
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: the repository replacement of 2026-11-08 (new main 6314c0c; old PR numbers name the private history)
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: `~/computer-use--cu-developer-two`,
a worktree of the main checkout, which is never edited. Records: [artifacts.md](artifacts.md).

## Issues

- In Verify (cu-verifier closes): CU-219, CU-229, CU-240, CU-259, CU-276. Done: CU-266, CU-267, CU-268, CU-273.
- In Progress: CU-282 (#122, the live-view MJPEG flake), CU-239 (fix when a gate failure names the path).
- Filed and triaged: CU-279 (an IDE's integrated terminal), likely covered by E5's terminal_view; closed on the
  terminal's accessible name, not a new rule.

## PRs waiting to land

- #122 (Fixes CU-282): OK'd by cu-verifier and cu-developer-one.
- #114 (Part of CU-252): seam rows through the real driver, 4/4. cu-developer-one OK'd it; cu-verifier's re-OK is due.
- #18 (Part of CU-226): the focus-after-click measurement tool. This records PR.

## Live state and open asks

- CU-276 is live: suite.sh registers `run-lock.mjs wait`, and a hold refused `phase2_waiting` waits about 2 minutes.
- D-075 lifted D-074's owner-data limit. Per-app approval, the lock, the idle rule and D-034's cost line stay. No
  seat acts in Finder (CU-252 uses the CU Fixture stand-in, #104).
- Helper 0.2.56 is installed, with both halves of CU-240 on main.
- Before each push, run the merge-tree check against main; GitHub's 'conflicting' can be stale.

## Next step

Land the queue and keep it mergeable. Add an artifacts row per merged PR. Review the driver, lock, MCP and live-view
PRs. Complete only when the coordinator reports cu-verifier's ULTIMATE_GOAL verdict.
