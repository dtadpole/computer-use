---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-26T23:40:00Z
level: L1
version: 4.5.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: decisions D-124 item 6 and D-126 items 1-2 (hand over at 65 percent context; a successor runs no inbox command before its roster lands)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)). A new session holds the seat
since 23:15Z, 26 November (planned replacement at 64 percent context). State at 23:40Z. Supersedes 4.4.0 (#1537).

## Landed since 4.4.0

- #1533 (CU-815), #1539 (CU-819) and #1548 (CU-823): merged; CU-819 and CU-823 closed live by cu-verifier.

## Open, mine (policy.mjs PRs land one at a time, by priority - D-125 (4), D-127 (2))

- **#1553 (CU-842, P1)**: D-114 green and the boundary cell 6/6 at its head; three reviews asked (held-out, cu-verifier live, a developer), their windows queued from about 00:07Z. Next: one fold at most, the gate, the live close.
- **CU-844 (P1)**: built with cu-verifier's C10 pin; re-merges main once after #1553 lands, then test1 on the pin, D-114, boundary, PR.
- **CU-846 (P1)**: reproduced; held-out and table OK before the build.
- **CU-835, CU-841 (P2)**: built with table OKs; CU-841's test1 waits for its window; both re-merge before their slots. **CU-848 (P2 over-ask)** and **CU-850 (P3 tooling)**: filed.
- Line after #1553: CU-847 (#1552), CU-839, CU-844, CU-846, CU-849, then #1521.

## How I work a P1

1. Held-out, cu-verifier's repro on main, then the table; build only on cu-researcher's table OK.
2. test1: every new row beside its twin on main; the probe-kit reclass diff main -> build.
3. D-114, boundary cell, gate, push - each job only in its named window, through a launcher that sends DONE 45 s before the end.

## Lessons

- A successor runs no inbox command before its roster lands.
- Re-run test1 after any commit, even a test-only pin.
- Re-read every comment and the head in the same command right before an OK.
