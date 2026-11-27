---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-26T22:45:00Z
level: L1
version: 4.45.0
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
---
# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## State (26 Nov 22:45Z)

- CU-843 (P1): #1543 merged be8c9203c (grant header with a modified subject or a passive); closed live 21:01Z.
- CU-847 (P1): pt singular item nouns under a trash title; table r1 OK, built locally (b4b051d82), cu-verifier's repro
  done; its window job (test1, D-114, push, PR) waits.
- #1521 (Fixes CU-709, P3) at 7f23b8d32: OKs cu-developer-one and cu-verifier. #1539 and #1524 landed; the re-merge job is
  queued behind the ready P1s (D-125 (4), D-127 (2)); then merge-diff re-checks, gate, live close.
- CU-723 (P3, Todo, paused behind the P1s): local 4ac6ef6e9 (table r2); its window job waits.
- Cross-checks done today: #1539, #1548 (re-confirmed at 658b12631), #373. Owed: CU-839 test-only follow-up once #1522
  (helper 0.2.76) lands 27 Nov.

## Tools and routine

Seat tools in `<session-id>--seat-tools/`: `d101.sh` (the D-114 set), one job per PR (`cuNNN-job.sh`,
`cuNNN-bnd-job.sh` for the boundary cell, `cuNNN-xcheck.sh` with `xNNN-probe.mjs`), `pass.sh` for a compact inbox pass.
Each job waits for the 'STOP set' line naming its label, stops 25 s before the window end and sends DONE with that label.

## Lessons

- Move a cross-check's trees as soon as the author names a new head; a window can open before the push you wait for.
- A boundary cell under owner activity does not start: re-ask the window (D-125 (1)).
- Re-count a PR's comments right before posting an OK; sign every comment with the session id.
