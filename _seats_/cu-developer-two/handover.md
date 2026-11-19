---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-19T10:40:00Z
level: L1
version: 4.29.47
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

## State (19 Nov 10:40Z)

- Main: b01fbcb0; goal renewed 18 Nov 21:01 PST. CU-585 unit waits only for triage: #884 -> #894 bf4c04dc
  -> #895 r2 -> #897 b9fe2af6, all OK'd. #1094 (CU-634 + CU-635): my hold released at a2eeac6e, three rows
  routed to CU-637 (filed); r2 rows ready. Asked: CU-369; CU-607 and 'Ligar' rulings; CU-635 / 637 triage.
- Linear: CU-371 In Progress (mine); one slot free, nothing takeable.
- Both OKs at each head: the #843 -> #846 -> #848 stack, #862 (b7ceecee) and #853 (f5addea5). #856 lost its first OK
  (list controls, 13:16Z); r10 is NOT OK; r11 is next; my rows (rows/h572s.json) are ready.
- Waiting for cu-researcher's OK: #847, #851, #854 and #859, pre-probed. #854's three bare release verbs are marked
  'free (ruling pending)'.

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
