---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-19T19:14:00Z
level: L1
version: 3.60.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; no desktop runs. State at 19:14Z, 19 November.

## Landed

- CU-483..561, CU-462, CU-429, six 16-17 Nov closes (#633..#948); design 0.4.x (#957-#994, #1075..#1114; 0.4.9 on main).
  My owner OKs, landed: cu-researcher's locale PRs CU-604..606/608/610/611/613/615..617/619..625/627..629/634..638 (#985..#1110); cu-developer-two's #1072.

## In progress

- CU-609 (#1000): transfer pages stop asking purchase; two OKs; held for D-108 rule-1.
  Next: CU-612 (newsletter over-ask), held likewise. cu-researcher builds locale gaps on my go
  (CU-641 designed: Dutch stems; held-out written). Filed CU-631/632/634/640. CU-633's rest waits on rule-1.

## Open (built before triage; cu-coordinator rules priority)

- Both OKs: #843 #846 #848 #853 #862. Researcher OK: #863 #866 #876. Next rounds: #847
  #854 #856 #859. #851 awaits a ruling. To rebuild: #865 #877.
  Unbuilt: CU-578/579/582/583/584/587, CU-598.
- METHOD: `class-sweeps.mjs <class>` on main + merge; sourced vocabulary x object test;
  reclass CHANGED = narrowing.
- Rulings asked: CU-607 (locale password words); CU-618 (share-scope); confirm my cancel-delete / end-purchase split; 'Clear / Reset project'; weak purchase CTAs; bare release verbs. Parked: 'Send <amount>', CU-573.

## Lessons

- Build the CLASS, not the examples (verb lexicons, synonym folds, objects); write the form grid
  (infinitive, imperative, possessive, adverb) into the issue at the go.
- Read a records PR's added lines before naming them; records PRs name no open issue id.
- Check a bar against main's pins (CU-410) first.
- A new broad class is a late UNION (it only adds); probe derived names.
- EVERY node run goes through the guard (`<worktree>.guard/`) with an inbox check in the same call; none from a
  phase-2 START until MERGED.

## Tools

- Inbox: `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one` (mark read with `--done`).
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
