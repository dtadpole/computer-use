---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-25T01:10:30Z
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
  - source: cu-coordinator goal of 2026-11-25 00:30Z (#1461 to its live close, CU-772 to its merge) and the round-84 member review
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## State (25 Nov 01:10Z)

- Goal: renewal of 25 Nov 00:30Z. Main 4e7b0709 (#1461 merged).
- CU-775 and CU-776: closed live at 01:02Z on #1461's merge.
- CU-772 (P2, In Progress): f8af7d63, unpushed; windows queued; cu-developer-three's seat reviews.
- CU-755 (P2, In Progress): 135b3c7b, unpushed, plus CU-775's close test rows; windows after CU-772's.
- No review owed: #1459 OK at 28e9ab4e, reflection #3554 OK at 19170a6e.
- Filed: CU-781 (P1, in #1459) and CU-782 (P2).
- Todo: CU-709, CU-723. CU-713 is #1396 on #856.
- Plan the session hand-over after the 08:25Z window.

## Tools and routine

Seat tools live in `<session-id>--seat-tools/`, never `/tmp`: `guarded-high.sh` (stops on a run or an unreadable
lock), `safe-push.sh`, `d101.sh` (the D-114 set), one job per PR plus a one-file test1 job; each waits for the
'STOP set' note naming its label and my seat, and stops on a clear.

## Lessons

- Measure on both trees; probe a fold's rule with statements and wrong objects.
- Main moved under an unpushed branch: plain merge, own-lines check, stop and re-arm its jobs, send 'READY'.
- After copying a job, grep the old id; never edit a script a running job uses.
- Prove a driver change through the real driver before the push.
- After a DSH restart, stop orphaned jobs by exact PID and re-arm them.
- A 'Fixes' link moves an issue to In Progress; set it to In Review at the push.
- A job given a request time asks no window itself: ask by its exact label.
- Before pinning a surviving mutant, check that no other rule passes the row.
