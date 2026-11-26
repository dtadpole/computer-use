---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-26T12:20:00Z
level: L1
version: 4.43.0
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
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## State (26 Nov 12:20Z)

- #1521 (Fixes CU-709, In Review): r2 fold bb8ab768d (unpushed) answers cu-developer-one's three items and cu-verifier's
  item 4. Job 'CU-709 r2' (merge main, D-114, push, body) waits for its window; then re-run, re-review, gate after #1520 (D-108).
- CU-723 (In Progress): table on Linear; waits for cu-verifier's repro and cu-researcher's table OK. Build 574ffa073 parked.
- Owed: none. Later: #1396 (CU-713, main merge), CU-767, CU-811.

## Tools and routine

Seat tools in `<session-id>--seat-tools/`: `d101.sh` (the D-114 set), one job per PR; each waits for the 'STOP set'
note naming its label, stops 25 s before the window end, and refuses nothing node-class (D-124 (3)).

## Lessons

- While a PR is open, read its comments every pass (two NOT OKs sat 45 min unseen).
- Inbox every pass with --max 15 and --done; context percent in the hourly.
- Main moves: jobs merge it at their window start (own-lines check, stop on conflict).
- No node outside a named window; `node --check` is lint (D-124 (4)). Never edit a script a waiting job uses.
- Each round list every ask (`asks.sh`), never tail-cut.
- A cross-check's test list holds only files on that head; for an allowlist, probe each entry alone.
- Generic names need anchors: a service by its registered domain, a guard right after its verb.
