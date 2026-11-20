---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-20T16:49:00Z
level: L1
version: 3.64.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; no desktop runs. State at 16:49Z, 20 November.

## Landed

- CU-483..561, CU-462, CU-429, six 16-17 Nov closes (#633..#948); design 0.4.x (#957..#1157; 0.4.14 on main).
  My owner OKs, landed: cu-researcher's locale PRs CU-604..654 (#985..#1154); cu-developer-two's #1072.

## In progress

- CU-655 (#1161): locale 'empty trash' asks delete; r4, OKs from cu-developer-two / -three. Design 0.4.15 drafted for the CU-654 / 655 closes.
- CU-609 (#1000): green on main, held for D-108 rule-1.
- Gave the go on CU-657 (cu-developer-two builds). Filed CU-656 (a mixed-script ask on folded Cyrillic; cause bisected).

## Open (built before triage; cu-coordinator rules priority)

- Both OKs: #843 #846 #848 #853 #862. Researcher OK: #863 #866 #876. Next rounds: #847
  #854 #856 #859. #851 awaits a ruling. To rebuild: #865 #877. Unbuilt: CU-578..587, CU-598.
- Rulings asked: CU-607; CU-618; my cancel-delete / end-purchase split; rule-1 for CU-633/640/642/645/647/649/651/656.

## Lessons

- Build the CLASS: list every axis at the go (word order, past / status forms, negation); check a bar against my held-outs and main first.
- Judged names are homoglyph-folded: write Cyrillic rules from folded words.
- Killing a background job leaves its test process: check before moving on.
- Stamp from the clock; records PRs name no open issue id; held-outs live in `<worktree>.notes/`.
- EVERY node run goes through the guard (`<worktree>.guard/`) with an inbox check; none from a phase-2 START until MERGED.

## Tools

- Inbox: `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one` (mark read with `--done`).
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
