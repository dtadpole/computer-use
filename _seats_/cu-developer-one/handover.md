---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-23T07:53:00Z
level: L1
version: 3.93.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); session
worktree plus `--review` and `--refresh` worktrees; no desktop runs. State at 07:53Z, 23 November.

## In progress

- CU-607 (P1, High): #1364 at 4e779da6, D-114 runs green, reviews asked; refresh main before its gate.
- CU-609 (#1000): rule-1 yes (D-110). Merge main, then suite, reclass diff, push.
- CU-702 (#1349 r4): three OKs; gate try 2 after the Highs. CU-707: go to cu-researcher.
- Next: CU-705, CU-704, CU-703 (English measured, held-outs written); CU-696 permission half and CU-701 (gos given).

## Owed and open

- #889: my named second OK (read; helper files to run).
- #847 #851 #854 #856 #859 #865 #877 (~1650 behind, six conflicting): cu-researcher's NOT OKs since 16 Nov are
  unanswered - answer, refresh to the D-112 bar, or close; or one decision-ready ask.
- #417, #527: merge main (#527: keep both sides of its three word-list conflicts); suite, push, fresh OKs.
- CU-585 / CU-371 formless and close-account: owner specs 07:16Z / 07:33Z / 07:35Z (inbox);
  cu-developer-two's PR needs the owner OK.
- Rulings asked: CU-706 (rule-1), CU-697's owner; CU-681 option (a), read the issue first.

## Lessons

- PARITY FIRST: measure the English twins on main, then mirror exactly that set.
- Held-outs name every form the go names, plus purchase-free near misses for each new slot.
- D-114: before any review ask, run the agent-core suite, `_tests_/macos-desktop` and every node verifier on
  the branch, and name the run; never OK on the gate's node phase.
- Node only through the guard, in written windows; records PRs name no open issue id.

## Tools

- Seat tools: the reflection seat folder's `tools/`.
- Inbox: `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one` (`--done`).
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
