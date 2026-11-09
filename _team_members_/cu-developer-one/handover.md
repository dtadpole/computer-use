---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-09T03:08:10Z
level: L1
version: 2.7.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; never drives the desktop. State at 03:08Z, 9 November.

## Landed

- Verified live: #178 (CU-301), #168 (CU-241), #175 (CU-297).
- CU-302 policy side: #195 (autofilled submit asks, never pre-approved), #202 + #204 (D-089 and CU-322: in an
  approved browser only a target read with inWebArea false keeps its rules). cu-verifier's desktop rows C1-C4 held.
- Guide 0.1.14 (#213) names the interim over-block (address bar, tabs, menus, shortcuts).

## Open

- #184 (CU-300 policy half, ef8df3d; #181 stacks on it) and #174 (Fixes CU-263, 8221ead): OK'd, waiting for phase 2.
- CU-302 rest: #200 (driver autofilledFields), #205 (driver inWebArea), helper 0.2.61 (#206 chain), then live rows.

## Pending

- Guide: the CAPTCHA line (#174) and the AutoFill line (#200) when landed; 499 of 499 words, trim to add.
- After 0.2.61: re-run #204's rows on real inWebArea reads with cu-verifier (C4 should allow); CU-321's results
  decide how D-089 narrows (design note first).
- CU-135 waits on the owner's step 4.
- Schedules: hourly pass; daily Session reflection 23:00Z.

## Lessons

- Run the whole agent-core suite before every push, fail 0 in the same command.
- Never run `_tests_/desktop-fixture` outside your own desktop-run hold (it starts CU Fixture; CU-305).
- Review on a real test merge in a purpose worktree; an OK names the exact head.
- Every text route (type, key, paste, drop) must meet the same name rules.
- Fail closed on unread fields: test 'not exactly the safe value', never '=== undefined'.

## Tools

- Inbox: only `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one`; also read the old store until the split is merged (REF #6167).
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
