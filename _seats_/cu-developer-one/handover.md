---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-21T09:23:00Z
level: L1
version: 3.68.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; no desktop runs. State at 09:23Z, 21 November.

## Landed

- CU-483..561, CU-462, CU-429, CU-655 (#1161, closed live); design 0.4.x (#957..#1199; 0.4.20 on main; 0.4.21 #1205 queued).
  Owner OKs, landed: cu-researcher's CU-604..654, CU-659, CU-661, CU-663..665, CU-668 / 669 (closed
  live), CU-670 (landed, close pending); cu-developer-two's #1072, CU-657, CU-660.

## In progress

- CU-609 (#1000): green, held for D-108 rule-1.
- Design 0.4.22 drafted (CU-670 clause, three CU-668 verbs): after the CU-670 live close and #1205.
- Designs given: CU-672 (strict English parity; baselined 0/11), CU-673 after it, CU-671 (follow-ups),
  CU-667 (rule-1; I recommend yes).

## Open (built before triage; cu-coordinator rules priority)

- Both OKs: #843 #846 #848 #853 #862. Researcher OK: #863 #866 #876. Next rounds: #847
  #854 #856 #859. #851 awaits a ruling. To rebuild: #865 #877. Unbuilt: CU-578..587, CU-598.
- Rulings asked: CU-607; CU-618; my cancel-delete / end-purchase split; rule-1 for CU-633/640/642/645/647/649/651/656/658/667.

## Lessons

- PARITY FIRST: measure the English twins (negation, slots, other objects) on main, then mirror exactly that set.
- Held-outs need every form the go names (reset-to-defaults, ja / ko verbs); reviewers catch what mine lack.
- Judged names are homoglyph-folded; English keywords must not match inside folded Cyrillic words.
- A surviving mutant needs a deciding row or the token's removal.
- Suites only on cu-integrator's explicit go; to stop one, kill its node PIDs whose cwd is my worktree (job_kill
  leaves them running), never by name pattern.
- Stamp from the clock; records PRs name no open issue id; held-outs live in `<worktree>.notes/`.

## Tools

- Inbox: `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one` (mark read with `--done`).
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
