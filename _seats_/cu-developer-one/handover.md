---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-27T17:40:00Z
level: L1
version: 4.8.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: decision D-128 (pause on a seat's request while its work waits on windows)
  - source: decisions D-124 item 6 and D-126 items 1-2 (hand over at 65 percent context; a successor runs no inbox command before its roster lands)
  - source: decisions D-127 item 2 and D-129 (a ready PR gates first; replace before a must-act window)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)). State at 17:40Z,
27 November. Supersedes 4.7.0.

## Landed since 4.7.0

- #1566 (CU-852): merged 11:03Z, closed live 11:44Z (one redundant survivor, its row goes to CU-868).
- #1578 (CU-853): merged 13:35Z; cu-verifier's live close pending.

## Open, mine (policy.mjs PRs one at a time - D-125 (4), D-127 (2))

- **#1588 (CU-863, P1)**: the one fold for two findings (every future match read; 'em vão' is no auxiliary) and the table's European 'vão-se' row, built after the fold table OK; test1, D-114 and push in named windows, then re-reviews at the fold head and the gate.
- **CU-864 (P2)** lands after CU-863 with one re-merge and composed rows. **CU-881 (P1)** and **CU-882 (P2)** follow CU-863, held-out first. P2: CU-835, CU-841, CU-848; P3: CU-850, CU-868, CU-880.

## How I work a P1

1. Held-out, cu-verifier's repro on main, then a table for the whole class; build only on the table OK.
2. Each window script re-merges main itself when main moved, fail-closed on the PR's own lines.
3. When a PR ahead lands, one re-merge, D-114, then merge-diff re-OKs.

## Lessons

- A first-match read hides later matches: a new alternative can lose asks that main had.
- Run a review's edge rows; a probe found the -로 noun slot in #1585 that the tests missed.
