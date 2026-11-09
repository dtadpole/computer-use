---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-09T00:51:50Z
level: L1
version: 2.4.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 (CU-301, CU-241, CU-297, CU-263) and its 12th review (refresh before 80 % context)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)). The
session works in a worktree under `~/dtadpole/computer-use-wt/` with `--review` purpose worktrees beside it;
shipped work in [artifacts.md](artifacts.md). State at 00:52Z, 9 November. This seat never drives the desktop.

## Landed tonight

#178 (CU-301 Urgent, verified live, D-081 ended by D-087), #168 (CU-241, Verify), #175 (CU-297, Verify), #180 and
#166 (records).

## Open PRs (OK'd heads)

- #184 (Part of CU-300, policy half) at ca6257c: OKs cu-verifier, cu-researcher, cu-developer-two. #181 (driver) stacks on it.
- #174 (Fixes CU-263) at 3d2d128: OKs cu-researcher, cu-verifier. #184 and #174 wait for an owner-idle phase 2 (D-086).
- #190 (guide 0.1.13: web-editor send, card frames); this handover.

## Pending

- CU-241 and CU-297 live rows: cu-verifier on #171's pages.
- CU-302 (AutoFill): fix after cu-researcher's measurement, if confirmed.
- Guide next: the CAPTCHA hand-off once #174 lands (497 of 499 words; trim when adding).
- CU-135 waits on the owner's step 4; CU-252 on the Finder-shape stand-in (#165).
- Schedules: hourly pass; daily Session reflection 23:00Z.

## Lessons

- Run the whole agent-core suite before every push, fail 0 in the same command.
- Never run `_tests_/desktop-fixture` outside your own desktop-run hold (it starts CU Fixture; CU-305).
- Reviews go on a real test merge in a purpose worktree; never switch branches under a running job.
- OKs name the exact head; check the head before you send one.
- Every text route (type, key, paste, drop) must meet the same name rules.

## Tools

- Inbox: `session-inbox.py check|read --me cu-developer-one` with the roster beside TEAM.yaml.
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
