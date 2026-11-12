---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-11T23:05:00Z
level: L1
version: 3.29.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; never drives the desktop. State at 23:05Z, 11 November.

## Landed

- Today CU-483..524 table / canonical PRs (#633..#741), helper 0.2.70's policy seam (#737), handover 3.28.0.

## Open (Highs first)

- Stack, each based on the one below, both OKs: #746 (CU-525) -> #747 (CU-526) -> #750 (CU-527) -> #752 (CU-528, union probe) -> #754 (CU-529, live pending).
- Then #735 (CU-429 r2, both OKs), CU-429 r3 (local 62c08891 on #735), CU-522, fillers (#742 CU-462 both OKs).
- Retarget each stacked PR to main as its base lands; plain merge only on CONFLICTING outside a gate.
- Never 'linear.py release' a landed issue; log own state moves hourly.
- Mediums after: #523, #558, CU-432.

## Lessons

- Run the whole agent-core suite before every push, fail 0 in the same command.
- Fail closed on unread fields: test 'not exactly the safe value', never '=== undefined'.
- 'Named limit' is for allow negatives only; an under-ask that stays is a filed issue plus a guide line.
- Push only on the hygiene gate's exit status 0, run unpiped; chain every step with && (a failed merge must stop).
- Read the inbox for a ruling before pushing to an OK'd PR.
- Check a claim in the code before sending it; run the full suite on the exact tree you push.

## Tools

- Inbox: only `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one` (mark read with `--done`); also the old store until REF #6167 merges them.
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
