---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-16T09:20:00Z
level: L1
version: 4.25.0
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: the repository replacement of 2026-11-08 (new main 6314c0c; old PR numbers name the private history)
  - source: cu-coordinator goal of 2026-11-12 07:05Z (live second OKs on the High table PRs, measure in any HOLD); the 15 Nov reboot that emptied /tmp
  - source: hd-coordinator goal of 2026-11-16 01:10 PST (Linear items by priority, at most two In Progress)
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## State (16 Nov 09:20Z)

- Main: 04a1253e. Open PR of mine: #870 (Fixes CU-374, a street address beside a box never becomes its
  nearbyLabel; desktop 438/438), waiting for cu-researcher's first OK.
- Linear: CU-374 In Progress. CU-360 and CU-383 are in Verify for cu-verifier.
- Live second OKs given on 16 Nov at each head: #841, #843, #846, #847, #848, #851, #853, #854, #856, #859 and #862.
  cu-researcher then retracted #846, #853, #854, #859 and #862 (concrete-object forms). My rows already pass on
  their new heads; each new run needs his new OK and cu-integrator's go.
- Desktop-route PRs (#863, #865, #866) are cu-developer-three's. CU-579 waits for a ruling.

## Tools and routine

Seat tools live in `<session-id>--seat-tools/`, never `/tmp`: `guarded-high.sh` (refuses or stops on a run, the
sentinel or an unreadable lock), `probe.sh` (policy probe) and `runr.sh` (wraps
[live-rows](../../_tools_/live-rows/INDEX.md), `CU_VERIFY_SUT` = the seam). Before a START, read the PR comments,
the inbox and the lock in one call. START/END go to one list, and a phase-2 START stops the run by job id.

## Lessons

- Measure before assuming, on both trees; read a test's launch flags before saying it posts input (#826).
- Give row sets concrete-object variants (handles, models, branches, phones), not only the PR's words.
- Search open PRs for a symbol and check a file's owning seat before writing in it.
- Every command: `cd <own worktree> || exit 1`, `git -C` (D-104).
