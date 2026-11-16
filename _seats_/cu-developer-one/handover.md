---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-16T05:40:00Z
level: L1
version: 3.35.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; never drives the desktop. State at 05:40Z, 16 November.

## Landed

- CU-483..561 table / canonical PRs (#633..#833), CU-462 (#742, #841), CU-429 rounds 2-5.

## Open (built before triage; cu-coordinator rules priority)

- Both OKs: stack #843 CU-565 -> #846 CU-566 -> #848 CU-563; #847 CU-567; #851 CU-569; #853 CU-570.
- In review: #854 CU-571 (r4 next: audience / reach class), #856 CU-572 (r4 pushed).
- For the ruling: 'Clear / Reset project'; 'Claim deal', 'Lock in price', 'Split payment'; 'Release', 'Launch',
  'Ship it', 'Release build'. Parked: 'Send <amount>' (after #847). Not built: CU-573.

## Lessons

- Build the CLASS, not the issue's examples: verb lexicons and synonym folds, object vocabularies read anywhere,
  wrappers stripped to a fixed point.
- A new broad row is a predicate read LAST (grammarClasses, only when no older row classed the name), so an older
  class always leads; still check policy-level rows (credential, physical) and diff class sets (reclass).
- EVERY node run goes through the run guard with the inbox checked in the same call; none from a phase-2 START until
  MERGED. The guard lives beside the worktree (`<worktree>.guard/`).

## Tools

- Inbox: `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one` (mark read with `--done`).
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
