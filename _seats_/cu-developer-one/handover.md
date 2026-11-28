---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-28T09:12:00Z
level: L1
version: 4.10.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: decision D-119 items 1-2 (one fold; one extra round only to remove an over-ask the PR introduced)
  - source: decisions D-124 item 6, D-126 items 1-2 and D-129 (hand over at 65 percent context, earlier before a must-act window; a successor runs no inbox command before its roster lands)
  - source: decisions D-125 item 4 and D-127 item 2 (policy.mjs PRs one at a time; a ready PR gates first)
  - source: decision D-133 item 1 (stand-down worktrees)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)). State at 09:12Z,
28 November, after a seat successor. Supersedes 4.9.0.

## Open, mine (policy.mjs PRs one at a time - D-125 (4), D-127 (2))

- **#1605 (CU-881, P1)** at 4c6fbf1e4: the build plus one fold for cu-verifier's finding - the en determiner 'No' + a
  listed noun stays a negation; the pt locative 'no' is masked only before a non-English verb form. test1 fold 15/15,
  D-114 green, pushed 08:40Z. Next: three re-OKs at 4c6fbf1e4 (held-out for the fold arms, cu-verifier live, developer
  cross-check), then its gate.
- **CU-892 + CU-890 (P1)**: table r1 + r1a and its rows OK'd; built locally. Waits on cu-verifier's repros on main, then
  its test1 and push windows; re-merge once #1604 / #1605 land (all three touch `emptiesTrashByDelete`).
- Queue: CU-897, CU-900 (P2); CU-898 + CU-899 (P3, one fix, after CU-881). Backlog: CU-773, CU-864, CU-882, CU-889,
  CU-835, CU-841, CU-848; P3 CU-850, CU-868, CU-880.

## Reviews (policy owner)

- **#1604 (CU-860)**: NOT OK at 45b6f7715 (tr bare 'V-mek üzere'; pt 'está por' in the active arm, ruled in scope); I
  review at its fold head. Whichever of #1604 / #1605 lands second routes the active-imminent window through
  `trashNegated()`.
- **#1606 (CU-873 + CU-896)**: OK at 7e3ebf6e4. **CU-874**: review when its PR opens.

## Lessons

- Measure every twin on main in-window before it goes into a test file; a twin can already ask by another rule.
- Scope a widened token to its language and probe the en determiner twins before the push.
- Write 'NOT OK', never 'No OK'.
- A STOP can move mid-window: ask a D-114-only window, and let a launcher's wait outlast the freeze.
