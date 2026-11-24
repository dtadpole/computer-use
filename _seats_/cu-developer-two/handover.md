---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-24T23:25:43Z
level: L1
version: 4.37.0
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
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## State (24 Nov 23:25Z)

- Goal: renewal of 24 Nov 20:30Z. Main 47f447f2.
- CU-775 with CU-776 (P1, In Review): #1461 at b103e8ad, D-114 green. Waits for the held-out,
  the policy check and the live review; one fold (D-119).
- CU-772 (P2, In Progress): 8f2e3df4, unpushed; windows queued.
- Owed: the #1459 re-check (CU-780 + CU-781) after my narrow NOT OK at 2a406d4a (a future-passive statement).
- Filed today: CU-781 (P1, in #1459) and CU-782 (P2).
- Todo: CU-755 (ac5400ce), CU-709, CU-723. CU-713 is #1396 on #856.

## Tools and routine

Seat tools live in `<session-id>--seat-tools/`, never `/tmp`: `guarded-high.sh` (stops on a run or an unreadable
lock), `safe-push.sh`, `d101.sh` (the D-114 set), one job per PR plus a one-file test1 job; each waits for the
'STOP set' note naming its label and my seat, and stops on a clear.

## Lessons

- Measure on both trees; probe a fold's new rule with statements and wrong objects too (#1446 r2).
- When main's code moves under an unpushed branch: plain merge, own-lines check, stop its jobs, re-arm.
- After copying a job, grep the old id; never edit a script a running job uses.
- Prove a driver change through the real driver before the push.
- After a DSH restart, stop orphaned jobs by exact PID and re-arm them.
- While main moves, merge, re-arm, then send 'READY <issue> at <head>' before my window.
- A 'Fixes' link moves a Todo issue to In Progress; set my issues to In Review at the push.
