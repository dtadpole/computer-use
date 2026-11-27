---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-27T03:45:00Z
level: L1
version: 4.6.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: decisions D-124 item 6 and D-126 items 1-2 (hand over at 65 percent context; a successor runs no inbox command before its roster lands)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)). State at 03:45Z,
27 November. Supersedes 4.5.0 (#1558, never landed).

## Landed since 4.4.0

- #1553 (CU-842), #1559 (CU-844): merged, closed live. #1562 (CU-846): merged 03:31Z, cu-verifier's live close running.

## Open, mine (policy.mjs PRs one at a time, by priority and readiness - D-125 (4), D-127 (2))

- **CU-851 (P1)**: re-merged with main (pt cell hand-merged with CU-846's), composed rows added; test1, D-114, boundary, push windows asked; then its PR and three reviews.
- **CU-852 (P1)**: built, test1 green (two locative twins already ask on main - CU-848's shape); re-merge after CU-851.
- **CU-853 (P1)**: built, test1 window queued. **CU-863 (P1)**: table OK (retirar / tirar out, clitic object in), building; same cell as CU-853, so it lands second.
- **P2**: CU-841 (test1 green), CU-835 (built), CU-848, CU-864; **P3**: CU-850.

## How I work a P1

1. Held-out, cu-verifier's repro on main, then a table that covers the whole class; build only on cu-researcher's table OK.
2. test1: every new row beside its twin on main; the probe-kit reclass diff main -> build.
3. One re-merge after the previous policy.mjs PR lands; D-114, boundary, push - each in its named window through a launcher that sends DONE 45 s before the end.

## Lessons

- A table's "free on main" is a claim: test1 checks it, and a wrong pin is a test-only fix before review.
- The second of two PRs on one line carries the composed rows.
- Re-read every comment and the head in the same command right before an OK.
