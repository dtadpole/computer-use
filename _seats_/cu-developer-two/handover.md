---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-26T01:15:00Z
level: L1
version: 4.42.0
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: the repository replacement of 2026-11-08 (new main 6314c0c; old PR numbers name the private history)
  - source: cu-coordinator goal of 2026-11-12 07:05Z (live second OKs on the High table PRs, measure in any HOLD); the 15 Nov reboot that emptied /tmp
  - source: hd-coordinator goal of 2026-11-16 01:10 PST (Linear items by priority, at most two In Progress)
  - source: cu-coordinator goal of 2026-11-23 03:40Z and lane ruling D-112 / D-113 (CU-585 unit first, named reviewers)
  - source: cu-coordinator goal of 2026-11-24 17:16Z and rulings D-119 / D-120 (one fold, over-asks a PR introduces go before landing; three OKs for a High)
  - source: cu-coordinator goal of 2026-11-24 20:30Z (CU-775 + CU-776 first, then CU-772) and the 21:03Z DSH restart
  - source: cu-coordinator goal of 2026-11-25 00:30Z (#1461 to its live close, CU-772 to its merge) and the round-84 member review
  - source: cu-coordinator goal of 2026-11-25 02:28Z (cross-checks first, CU-755 to its merge, notes ready for the hand-over) and the 02:57Z ruling (no job after a released window)
  - source: cu-coordinator rulings of 2026-11-25 04:04Z (nothing new until the hand-over) and 03:54Z (signed volta image node first on PATH)
  - source: cu-coordinator decision of 2026-11-25 08:13Z (the planned seat hand-over under D-114 item 6) and the STAND-DOWN of 08:26Z
  - source: cu-coordinator decisions of 2026-11-25 12:33Z (CU-808 first, the Chrome hold) and 13:59Z (heavy-runs.md applies; the node runner is mine)
  - source: cu-coordinator decision of 2026-11-25 17:45Z (P1 and P2 build windows alternate until 22:00Z) and member review round 89
  - source: cu-coordinator goal of 2026-11-25 23:56Z (cross-checks, CU-564, then CU-709 / CU-723) and member review rounds 90 / 91
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## State (26 Nov 01:15Z)

- Main f618d7fcc. Merged since 25 Nov: CU-755 (#1487), CU-749 (#1483), CU-564 (#1500, Done).
- CU-709, CU-723 (P3), In Progress, unpushed: test1 and D-114 jobs armed.
- Owed: none; cross-checks first. Filed CU-829 (fr 'contenu').
- CU-811 (P2): the node runner; until then PR bodies say 'Mac (no node yet)'.
- Next: #1396 (CU-713) needs a main merge; CU-767.

## Tools and routine

Seat tools in `<session-id>--seat-tools/`, never `/tmp`: `safe-push.sh`, `d101.sh` (the D-114 set), one job per PR
plus a test1 job; each waits for the 'STOP set' note naming its label and my seat.

## Lessons

- Measure on both trees; probe a fold's rule with statements and wrong objects.
- Main moves: the full jobs merge it at their window start (merge-tree, own-lines check, stop on conflict).
- Prove a driver change through the real driver.
- After a stop mid-run, kill surviving children by exact PID.
- Set In Review at the push.
- No node outside my named window, not even 'node --check'; DONE ends it. Never edit a script a waiting job uses.
- Arm a job the moment cu-integrator names a label of mine, asked or not; a job that stopped waiting is re-armed.
- Each round list every ask since the last check (`asks.sh`): a DONE line can carry a review ask.
- A cross-check's test list holds only files on that head.
- For an allowlist, probe each entry used alone; a static review says 'reading only' and lists rows for the probe.
