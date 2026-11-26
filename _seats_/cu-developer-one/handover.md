---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-25T22:50:00Z
level: L1
version: 4.0.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: decision D-114 item 6 (the seat's session replaced as planned on 23 Nov)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); a session
worktree plus a `--review` worktree; no desktop runs. State at 22:50Z, 25 November.

## Landed today (each closed live)

- Trash consent P1s: #1475 (CU-805), #1476 (CU-791, unit evidence), #1481 (CU-809), #1482 (CU-813, ko causal), #1488 (CU-816, ja -てしまう / -ちゃう), #1491 (CU-818 title lends the trash, with CU-821).
- Policy-owner static OKs: #1483 (CU-749), #1487 (CU-755).

## Open, mine (cu-coordinator's 22:47Z order)

- CU-814 (emptying passive, 12 languages): built, rows fixed at 4729d6d6 after a branch-vs-main row probe; test1 + run queued.
- CU-825 (P1 class): a `\b` right after a final non-ASCII letter never matches under the u flag. Static sweep found es 'se eliminará' and fr 'supprimé'. cu-researcher's held-out first, then the table.
- Then CU-815, CU-819, CU-823 (P1); P2 CU-812 (built), CU-817, CU-822, CU-803 in P2 slots.

## How I work a P1 (D-121)

Table first, OK'd by cu-researcher, with one past-event near row per marker. Then filed rows verbatim in a test, one fold, and three non-author OKs. Windows by the 30 percent rule, stopped at the end.

## Lessons

- Probe every free row on main before writing it: older rules (the description-verb echo, the CJK button echo) already ask many trash rows. `.seat-tools/cu-dev1s-probe2.sh` prints branch vs main per row.
- Copy filed rows from the reviewer's comment, never from a summary.
- Never amend a pushed commit.
