---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-27T09:15:00Z
level: L1
version: 4.7.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: decision D-128 (pause on a seat's request while its work waits on windows)
  - source: decisions D-124 item 6 and D-126 items 1-2 (hand over at 65 percent context; a successor runs no inbox command before its roster lands)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)). State at 09:15Z,
27 November. Supersedes 4.6.0.

## Landed since 4.6.0

- #1564 (CU-851): merged 04:37Z, closed live 05:05Z (no surviving mutant).

## Open, mine (policy.mjs PRs one at a time, by priority and readiness - D-125 (4), D-127 (2))

- **#1566 (CU-852, P1)** at a93d043c7: one plain re-merge after #1565 plus the one fold for the cross-check's F1 (a negation before an imminent auxiliary frees it as it frees 'will be'). Three OKs at the head; gate queued 10:50Z.
- **CU-853 (P1)**: built on #1566's head; test1, D-114 and boundary windows booked; push and PR after #1566 lands (one plain re-merge).
- **CU-863 (P1)**: built on CU-853's head with the composed rows; test1 booked; the rest after CU-853 lands.
- **CU-864 (P2)**: table OK, built, test1 green; lands after CU-863 (same line). **P2**: CU-835, CU-841, CU-848; **P3**: CU-850, CU-868; filed CU-870 (sibling of CU-864).

## How I work a P1

1. Held-out, cu-verifier's repro on main, then a table that covers the whole class; build only on cu-researcher's table OK.
2. test1: every new row beside its twin; the probe-kit reclass diff base -> build.
3. Build the next PR on the head ahead of it when the coordinator says so; one plain re-merge after that head lands; D-114, boundary, push in named windows.

## Lessons

- A fold fixes the class, not the rows: F1 was a negation window counted from the participle; the fix reads the longer auxiliary as 'will be'.
- Measure context as pressure tokens over the window, to one decimal.
- When every item waits on windows 30 minutes or more ahead, ask for a pause (D-128).
