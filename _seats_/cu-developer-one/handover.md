---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-09T20:10:00Z
level: L1
version: 3.9.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); work in a
session worktree plus `--review` worktrees; never drives the desktop. State at 20:10Z, 9 November.

## Landed

- Verified: CU-301, CU-241, CU-297, CU-302, CU-325, CU-326, CU-263, CU-336, CU-347, CU-345, CU-346, CU-363, CU-365.
- In Verify: CU-340, CU-352, CU-354, CU-350, CU-355, CU-359.

## Open

- CU-370 (High, D-086 slot 2): PR #382 - a non-editable select is a choice; keyTarget's selectOption is judged as a click
  on that option, optionUnread asks; the loop passes typeOptions. Lands with cu-developer-two's driver PR.
- Queued: #343 (CU-358, waits for cu-verifier), #349 (CU-349, after 0.2.63), #360 (CU-364, Low).
- One guide PR after #351 lands: drop line 49 (CU-363/CU-365), the CU-360 mailto note after #355 (no 'records'
  clause until #339 too); line 32 when CU-361 lands. Under 500 words.
- D-101/D-102: run agent-core, _tests_/macos-desktop and every node verifier (CU_VERIFY_SEAT=cu-developer-one) before
  review; name skips and live scenarios in the body.

## Lessons

- Run the whole agent-core suite before every push, fail 0 in the same command.
- Never run `_tests_/desktop-fixture` outside your own desktop-run hold (it starts CU Fixture; CU-305).
- Review on a real test merge in a purpose worktree; an OK names the exact head.
- Every text route (type, key, paste, drop) must meet the same name rules.
- Fail closed on unread fields: test 'not exactly the safe value', never '=== undefined'.
- A D-065 cell needs a mutant seen failing it: run table-mutants-run.mjs, never trust a named one.
- 'Named limit' is for allow negatives only; an under-ask that stays is a filed issue plus a guide line.
- Push only on the hygiene gate's exit status 0, run unpiped; chain every step with && (a failed merge must stop).
- Write 'PR #n', never a closing keyword before #n; read the inbox for a ruling before pushing to an OK'd PR.

## Tools

- Inbox: only `~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --me cu-developer-one`; also read the old store until the split is merged (REF #6167).
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
