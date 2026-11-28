---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-27T23:15:00Z
level: L1
version: 4.9.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: decision D-119 items 1-2 (one fold; one extra round only to remove an over-ask the PR introduced)
  - source: decisions D-124 item 6 and D-126 items 1-2 (hand over at 65 percent context; a successor runs no inbox command before its roster lands)
  - source: decisions D-125 item 4 and D-127 item 2 (policy.mjs PRs one at a time; a ready PR gates first)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)). State at 23:15Z,
27 November. Supersedes 4.8.0.

## Open, mine (policy.mjs PRs one at a time - D-125 (4), D-127 (2))

- **#1588 (CU-863, P1)** at ecdc09d4a: the fold (ed7da55fc) plus one extra round under D-119 (1) - a later future right after
  'nem' / 'né' / 'ni' is not read, as on main (the fold's every-match read had made it ask). test1, D-114 and push green in
  named windows. Next: three re-OKs of that round, the gate, cu-verifier's live close.
- **CU-881 (P1)**: table OK'd (a pt locative 'no' + noun, or before a pt-only verb, is no negation); built locally, waits on
  cu-verifier's repro and on #1588 landing.
- **CU-864 (P2)** lands after CU-863 with one re-merge; **CU-882**, **CU-889** (the pt negation list) after CU-881. P2: CU-835,
  CU-841, CU-848; P3: CU-850, CU-868, CU-880.

## Reviews

- **#1591 (CU-858)**: my policy-owner finding (a negated -mAmIş participle frees a pending clause) is in its fold table;
  I review at the fold head.

## Lessons

- Measure every twin on main before it goes into a test file; a twin can already ask by another rule.
- While a reviewer's OK on a table is pending, send a delta, not a new revision.
- A tr negation anywhere frees the whole sentence: every added negation form can lose asks.
