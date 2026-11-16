---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-16T04:55:00Z
level: L1
version: 3.34.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; never drives the desktop. State at 04:55Z, 16 November.

## Landed

- CU-483..561 table / canonical PRs (#633..#833), CU-462 (#742, #841), CU-429 rounds 2-5.

## Open (built before triage; cu-coordinator rules priority)

- Stack #843 CU-565 -> #846 CU-566 -> #848 CU-563 (name probe to a fixed point); landing order as listed.
- #847 CU-567 (both OKs), #851 CU-569 (OK), #853 CU-570 (r2), #854 CU-571 (new).
- For the ruling: 'Clear / Reset project'; 'Claim deal', 'Lock in price', 'Split payment'; 'Release', 'Launch', 'Ship it'.
- Parked: 'Send <amount>' purchase (a follow-up after #847). Next: CU-572.

## Lessons

- Build the CLASS, not the issue's examples (three NOT OKs on 16 Nov): fold synonyms to the canonical verb, bind
  verbs to their objects, strip wrappers to a fixed point.
- Diff class sets against main (reclass); an older class leads - a new row may union, never replace.
- EVERY node run goes through the run guard with the inbox checked in the same call; none from a phase-2 START until
  MERGED. The guard lives beside the worktree (`<worktree>.guard/`).

## Tools

- Inbox: `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one` (mark read with `--done`).
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
