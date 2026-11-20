---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-20T10:53:00Z
level: L1
version: 3.63.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; no desktop runs. State at 10:53Z, 20 November.

## Landed

- CU-483..561, CU-462, CU-429, six 16-17 Nov closes (#633..#948); design 0.4.x (#957..#1148; 0.4.13 on main).
  My owner OKs, landed: cu-researcher's locale PRs CU-604..606/608/610/611/613/615..617/619..625/627..629/634..638/641/643/648/650 (#985..#1142); cu-developer-two's #1072.

## In progress

- CU-609 (#1000): transfer pages stop asking purchase; two OKs; still green on main; held for D-108 rule-1. Next: CU-612, held likewise.
- Reviews: #1149 (CU-644 clear-history): my owner OK at r2, four OKs, gate held by tooling (CU-653); design 0.4.14 drafted for its close.
  #1129 (CU-645): my OK, four OKs, lands only on rule-1. Held-outs: `<worktree>.notes/` (copies keep file times; /tmp is cleaned).

## Open (built before triage; cu-coordinator rules priority)

- Both OKs: #843 #846 #848 #853 #862. Researcher OK: #863 #866 #876. Next rounds: #847
  #854 #856 #859. #851 awaits a ruling. To rebuild: #865 #877. Unbuilt: CU-578..587, CU-598.
- Rulings asked: CU-607; CU-618; my cancel-delete / end-purchase split; rule-1 for CU-633/640/642/645/647/649/651.

## Lessons

- Build the CLASS: list object families and every inflection axis at the go; check a new bar against my own held-outs before posting.
- Baseline a held-out on main before a class ruling; probe past-tense and statement homographs.
- Stamp from the clock or the file time, never from memory; records PRs name no open issue id.
- EVERY node run goes through the guard (`<worktree>.guard/`) with an inbox check; none from a phase-2 START until MERGED.

## Tools

- Inbox: `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one` (mark read with `--done`).
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
