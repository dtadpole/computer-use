---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-24T19:50:47Z
level: L1
version: 4.36.0
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: the repository replacement of 2026-11-08 (new main 6314c0c; old PR numbers name the private history)
  - source: cu-coordinator goal of 2026-11-12 07:05Z (live second OKs on the High table PRs, measure in any HOLD); the 15 Nov reboot that emptied /tmp
  - source: hd-coordinator goal of 2026-11-16 01:10 PST (Linear items by priority, at most two In Progress)
  - source: cu-coordinator goal of 2026-11-23 03:40Z and lane ruling D-112 / D-113 (CU-585 unit first, named reviewers)
  - source: cu-coordinator goal of 2026-11-24 17:16Z and rulings D-119 / D-120 (one fold, over-asks a PR introduces go before landing; three OKs for a High)
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## State (24 Nov 19:50Z)

- Goal: renewal of 24 Nov 17:16Z. Main a956d367. CU-765 closed live (#1443).
- CU-772 (P2, In Progress): 815952ad, unpushed; test1 and D-114 windows queued next, then cu-developer-three's review.
- CU-775 with CU-776 (P1, one PR): efddcfa6, unpushed, test `_tests_/agent-core/lead-in-openers.test.mjs`; windows after
  CU-772's. Then cu-researcher's held-out, cu-developer-one's policy check, cu-verifier live, one fold (D-119).
- Cross-checks given today: #1426 (37464f97), #1446 r3 (bd40b906), #1448 r2 (b14e166f), #1444 (2804f872); none owed.
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
