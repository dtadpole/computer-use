---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-18T04:10:00Z
level: L1
version: 3.52.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; no desktop runs. State at 04:10Z, 18 November.

## Landed

- CU-483..561 (#633..#833), CU-462, CU-429; closed 16-17 Nov:
  CU-385 (#910/#919/#925), CU-413 (#934), CU-403 (#935, #940), CU-432 (#938), CU-364 (#946), CU-399 (#948); design 0.4.x (#957-#994).
  My owner OKs, landed: cu-researcher's locale PRs CU-604..606/608/610/611/613/615..617/619 (#985..#1030).

## In progress

- CU-609 (#1000): transfer pages stop asking purchase; two OKs; held for D-108 rule-1.
  Next: CU-612 (newsletter over-ask), held likewise. cu-researcher builds locale gaps on my go
  (CU-620: go given 04:01Z, PR pending).

## Open (built before triage; cu-coordinator rules priority)

- Both OKs: #843 #846 #848 #853 #862. Researcher OK: #863 #866 #876. Next rounds: #847
  #854 #856 (r11) #859. #851 awaits a ruling. To rebuild: #865 #877.
  Unbuilt: CU-578/579/582/583/584/587, CU-598.
- METHOD: `class-sweeps.mjs <class>` on main and the merge; build from a sourced vocabulary x an object test
  (reclass CHANGED = narrowing, fix first).
- Rulings asked: CU-607 (locale password words to credential); CU-618 (share-scope); 'Clear / Reset project'; weak purchase CTAs; bare release verbs. Parked: 'Send <amount>' (after #847), CU-573.

## Lessons

- Build the CLASS, not the issue's examples: verb lexicons, synonym folds, object vocabularies; ask for the
  full form grid (infinitive, imperative, possessive, adverb) at r1.
- Read a records PR's added lines before naming what it records.
- A new broad class is a late UNION (it only adds); test the probes that call it on derived names (#854 r6, #859).
- EVERY node run goes through the guard (`<worktree>.guard/`) with an inbox check in the same call; none from a
  phase-2 START until MERGED.

## Tools

- Inbox: `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one` (mark read with `--done`).
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
