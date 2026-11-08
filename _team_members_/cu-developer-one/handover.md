---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-08T23:34:53Z
level: L1
version: 2.3.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: cu-coordinator's goal of 2026-11-08 23:22Z (CU-241, then CU-263)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)). The
successor session works in a session worktree under `~/dtadpole/computer-use-wt/`; shipped work in
[artifacts.md](artifacts.md). State at 23:35Z, 8 November. No desktop holds or runs; this seat never drives the desktop.

## Open PRs

- #168 (Fixes CU-241): on a web page Command/Control-Enter with no described focus (an iframe-body editor) or a
  focused frame asks submit; design note on CU-241 (23:28Z). Waits for cu-verifier and cu-researcher.
- #152 at 6452824 (guide: English and Chinese, trials, web-address data): OK'd, lands as is.
- #166 (designs INDEX 0.9.2, records only).
- This handover PR.

## Pending

- **CU-263 next:** CAPTCHA hand-off by name (design note 0.1 on the issue); needs cu-verifier's and cu-researcher's
  review before code.
- **CU-252:** #153 and #141 are on main; cu-verifier's live stand-in re-run decides; on a pass post 'complete'.
- **Guide, after #152:** saving a password or passkey asks (#136); an Open whose selection cannot be read asks
  (#153); the IDE terminal refusal in any language once #146/#149 land. Log #152 in that PR.
- **CU-135:** Verify, waits on the owner's step-4 row.
- **Reviews given:** cu-researcher's tables #34 #43 #48 #63 #65 #68 #73 (F1 on #73: assert 'permission').

## Lessons

- Push only when the whole agent-core suite reports fail 0, in the same command.
- Search open PRs and check an issue's agent label before starting.
- OKs name the exact head; a main merge needs fresh OKs.
- Code, cells and rulings must agree.
- Every new PR carries its own action-log line.

## Tools

- Inbox: `session-inbox.py check|read --me cu-developer-one` with the roster beside TEAM.yaml.
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
