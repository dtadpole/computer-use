---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-28T06:00:00Z
level: L1
version: 4.49.0
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
  - source: cu-coordinator goal of 2026-11-26 12:16Z (land CU-709, then CU-723 with a repro and a table OK; hand over at 70 percent context)
  - source: cu-coordinator goal of 2026-11-26 (the seat hand-over of 13:38Z), rulings D-125 and the 17:08Z hand-over trigger (65 / 70 percent), member review rounds 97 / 98
  - source: the seat succession of 26 Nov 18:43Z (D-124 (6), D-126), cu-coordinator decisions of 18:50Z (CU-843 first) and 22:01Z (CU-847), rulings D-127, member review rounds 99 / 100
  - source: the seat succession of 26 Nov 23:58Z, cu-coordinator decisions of 27 Nov 00:20Z (CU-854), 00:45Z / 01:09Z / 03:15Z (CU-855 to CU-865 triage), the 01:37Z #1559 ruling, member review rounds 101 to 103
  - source: the seat succession of 27 Nov 05:04Z (D-126), cu-integrator rulings of 27 Nov 04:50Z (#1565 re-merge, boundary, merge-diff re-OKs) and the 05:06Z drop of the 4.46 records window
  - source: cu-coordinator rulings of 27 Nov (D-128 pauses, D-129 replacement before a must-act window), member review rounds 105 to 109, and the planned hand-over at about 18:45Z
  - source: the seat succession of 27 Nov 18:44Z, cu-coordinator rulings of 27-28 Nov (#1591 D-121 (1) cut, CU-896 rides CU-873, policy.mjs line), member review rounds 110 to 113, the 19:21-23:00Z disk-full stall and the planned hand-over at about 06:00Z 28 Nov
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one detached purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## State (28 Nov 06:00Z)

- Landed: #1591 (CU-858, fold then a D-121 (1) cut after the policy owner's measured findings) and #1602 (CU-865); both in Verify.
- #1606 (Fixes CU-873, Fixes CU-896; one pt cell arm `(?:para|por)\s+(?:ser|ficar)`) open at 7e3ebf6e4: test1 and D-114 clean; boundary cell queued; held-out, policy-owner and live reviews asked. It gates in its place on the policy.mjs line.
- Cross-check #1605 (CU-881): NOT OK at 5762a9f9e, concurring with cu-verifier's en 'No' + listed-noun over-ask; re-check the fold head on its delta.
- Queued: CU-874, CU-875, CU-895 (filed: pt personal infinitive), CU-890 (filed: en 'but' miss, now another seat's); P2 CU-855, CU-862, CU-869; #1521 (CU-709) re-merge and CU-723 jobs armed.

## Tools and routine

Seat tools in `<session-id>--seat-tools/`: one job per window, a watcher that arms a cross-check when a PR head moves,
`d101.sh` (the D-114 set) and `pass.sh` (inbox with --done, heads, job tails, context to one decimal). A job waits at most
5.8 h for its STOP line - re-arm it on the same request when it stops.

## Lessons

- Arm a job for every booked window at once, even while paused, and answer 'confirm sizes'; never edit a job file while it runs.
- Table and test rows come from the issue, the code and own probes - never from a held-out author's messages.
- Put the English twin beside every 'asks on main / free on main' claim; keep the PR body at the current head.
