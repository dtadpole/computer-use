---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-11T19:22:00Z
level: L1
version: 3.27.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; never drives the desktop. State at 19:22Z, 11 November.

## Landed

- Today CU-483..513 table / canonical PRs (#633..#720), incl. CU-507's web unit and 'Continue to' follow-up; handover 3.26.0.

## Open (Highs first)

- Lane: #721 (CU-514 + CU-515), #723 (CU-516), #725 (CU-517), then helper 0.2.70 (CU-507 desktop fill), CU-429 round 2 (built locally to the 17:21Z list), fillers.
- Stacked PRs: retarget each to main as its base lands; plain merge only when GitHub says CONFLICTING outside a gate.
- Table rows are verb families with object synonyms; older classes lead unless a ruling raises them (then update the pin with a note).
- Mediums: CU-462 (main-merged locally), #523, #558, CU-432; the 0.2.70 seam.

## Lessons

- Run the whole agent-core suite before every push, fail 0 in the same command.
- Every text route (type, key, paste, drop) must meet the same name rules.
- Fail closed on unread fields: test 'not exactly the safe value', never '=== undefined'.
- 'Named limit' is for allow negatives only; an under-ask that stays is a filed issue plus a guide line.
- Push only on the hygiene gate's exit status 0, run unpiped; chain every step with && (a failed merge must stop).
- Read the inbox for a ruling before pushing to an OK'd PR.
- Check a claim in the code before sending it; run the full suite on the exact tree you push.

## Tools

- Inbox: only `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one` (mark read with `--done`); also the old store until REF #6167 merges them.
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
