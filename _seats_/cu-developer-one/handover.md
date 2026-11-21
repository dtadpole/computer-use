---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-21T07:20:00Z
level: L1
version: 3.67.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; no desktop runs. State at 07:20Z, 21 November.

## Landed

- CU-483..561, CU-462, CU-429, CU-655 (#1161, closed live); design 0.4.x (#957..#1195; 0.4.19 on main).
  Owner OKs, landed: cu-researcher's CU-604..654, CU-659, CU-661, CU-663, CU-664, CU-665 (all closed live);
  cu-developer-two's #1072, CU-657, CU-660.

## In progress

- CU-609 (#1000): green, held for D-108 rule-1.
- Design 0.4.20 (CU-665 clause) with this handover; next clause: CU-668 after it closes live.
- Designs given: CU-668 (go, cu-researcher builds; adds asks), CU-667 (rule-1; I recommend yes).
- Filed: CU-665, CU-666 (test flake, with cu-developer-three's CU-614 family).

## Open (built before triage; cu-coordinator rules priority)

- Both OKs: #843 #846 #848 #853 #862. Researcher OK: #863 #866 #876. Next rounds: #847
  #854 #856 #859. #851 awaits a ruling. To rebuild: #865 #877. Unbuilt: CU-578..587, CU-598.
- Rulings asked: CU-607; CU-618; my cancel-delete / end-purchase split; rule-1 for CU-633/640/642/645/647/649/651/656/658/667.

## Lessons

- Build the CLASS: list every axis at the go; held-outs cover each, checked on main first.
- Judged names are homoglyph-folded: write Cyrillic rules from folded words; English keywords must not match inside folded Cyrillic words.
- A surviving mutant needs a deciding row or the token's removal.
- One inbox watcher alive after every read; suites only in a window cu-integrator names, never beside a gate.
- Keep the word "hold" away from PR numbers in window asks (the pre-merge check reads it).
- Stamp from the clock; records PRs name no open issue id; held-outs live in `<worktree>.notes/`.

## Tools

- Inbox: `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one` (mark read with `--done`).
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
