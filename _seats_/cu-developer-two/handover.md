---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-26T18:45:00Z
level: L1
version: 4.44.0
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
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## State (26 Nov 18:45Z)

- CU-840 (P1): #1534 merged 02e3bd7aa; in Verify for cu-verifier's live close. Owed after CU-839 lands: a test-only
  follow-up (each bound pinned at its exact edge, a 60-unit and a non-BMP row; member review round 98).
- #1521 (Fixes CU-709, P3) at 7f23b8d32: OKs cu-developer-one (static) and cu-verifier. Policy line #1539 -> #1524 -> #1521;
  then re-merge main (job ready), D-114, merge-diff re-checks, gate, live close.
- CU-723 (P3): re-made to table r2 at 4ac6ef6e9 (exactly four whole pointer phrases, never a pending act); its window job
  (test1, D-114, push, PR) waits.
- Cross-checks: #1539 (CU-819) at its re-merged head, job armed; done: #1528, #1533, #373 (static).
- Later: CU-713 in Backlog (#1396 waits for #856's D-125 (3) exit), CU-767.

## Tools and routine

Seat tools in `<session-id>--seat-tools/`: `d101.sh` (the D-114 set), one job per PR, `cu2-bnd.sh` (the boundary cell),
`cuNNN-xcheck.sh` with `xNNN-probe.mjs` per cross-check. Each waits for the 'STOP set' line naming its label, stops 25 s
before the window end and sends DONE with that label verbatim.

## Lessons

- An AXSwitch has no native state on the desktop: test turning off on AXCheckBox only.
- Pin each bound on both sides; a probe uses each language's filed button.
- Re-count a PR's comments right before posting an OK; moving a head breaks a waiting job's match, so re-arm it.
- After a DSH restart, check `ps` before re-arming; never duplicate a job. d101 lines read 'agent-core:'.
