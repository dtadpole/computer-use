---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-16T11:00:00Z
level: L1
version: 4.26.0
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

## State (16 Nov 11:00Z)

- Main: a56d87e7. No open PR of mine. #870 (Fixes CU-374) landed as de2568d0 after six rounds. Its option (c):
  a bare street that alone asks reads as 'street address'.
- Linear: CU-360, CU-374 and CU-383 are in Verify for cu-verifier. No driver item waits in my queue.
- Both OKs at each head: the #843 -> #846 -> #848 stack (d5ae7481, dd8187e9).
- cu-researcher's broad class sweeps retracted #847, #851, #853, #854, #859 and #862 at 10:20Z. New heads are judged
  against the probe kit's class sweeps (#878). My rows add the class's whole sweep (rows/h<n>s.json), with expect =
  main's class plus the new one.
- Running now: #856 r7 (693d0ba3, 51 rows). Next: #862 r5 (b7ceecee) and #851 (833aa487), both pre-probed clean.

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
