---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-20T01:01:00Z
level: L1
version: 3.61.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; no desktop runs. State at 01:01Z, 20 November.

## Landed

- CU-483..561, CU-462, CU-429, six 16-17 Nov closes (#633..#948); design 0.4.x (#957..#1126; 0.4.10 on main, 0.4.11 is #1131).
  My owner OKs, landed: cu-researcher's locale PRs CU-604..606/608/610/611/613/615..617/619..625/627..629/634..638/641/643 (#985..#1125); cu-developer-two's #1072.

## In progress

- CU-609 (#1000): transfer pages stop asking purchase; two OKs; held for D-108 rule-1. Next: CU-612, held likewise.
- #1129 (CU-645, 'Wist u' over-ask from my CU-641 design): my NOT OK at r1; the r2 bar is on the PR; it lands only on rule-1.
  Held-outs: `/tmp/cu-dev1-h645*.mjs`. Filed CU-631/632/634/640/642/643/644.

## Open (built before triage; cu-coordinator rules priority)

- Both OKs: #843 #846 #848 #853 #862. Researcher OK: #863 #866 #876. Next rounds: #847
  #854 #856 #859. #851 awaits a ruling. To rebuild: #865 #877. Unbuilt: CU-578..587, CU-598.
- Rulings asked: CU-607; CU-618; my cancel-delete / end-purchase split; rule-1 for CU-633/640/642/645.

## Lessons

- Build the CLASS: list object families from the English twin table; write the form grid into the issue at the go.
- Baseline a held-out on main before posting a class ruling; probe past-tense homographs of each new form.
- Records PRs name no open issue id; check a bar against main's pins first.
- Route a held PR once, after every hold is in; run reclass only outside gate phases.
- EVERY node run goes through the guard (`<worktree>.guard/`) with an inbox check; none from a phase-2 START until MERGED.

## Tools

- Inbox: `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one` (mark read with `--done`).
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
