---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-21T09:04:00Z
level: L1
version: 4.29.65
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

## State (21 Nov 09:04Z)

- Main: a1fa5154; goal renewed 20 Nov 19:01 PST. Fourteen fixes between CU-641 and 670 landed on my OKs (last: 668, 670), CU-657 / 660 on my builds.
  CU-645: #1129 r2 has all OKs, waits for rule-1. Held-outs wait for the CU-647 / 649 PRs.
  CU-585 unit waits for triage (#884 / #894 / #895 / #897). Asked: CU-607, 'Ligar', triage, CU-645's rule-1 yes.
- Linear: CU-371 In Progress.
- Both OKs at each head: the #843 -> #846 -> #848 stack, #862 (b7ceecee) and #853 (f5addea5). #856 lost its first OK
  (list controls); r10 is NOT OK; r11 is next; my rows (rows/h572s.json) are ready.
- Waiting for cu-researcher's OK: #847, #851, #854, #859 (pre-probed). #854's three bare release verbs are marked
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
