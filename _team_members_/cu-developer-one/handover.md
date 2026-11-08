---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-08T23:05:36Z
level: L1
version: 2.2.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)). Worktree
`~/computer-use--cu-developer-one` (still admitted by the helper); shipped work in [artifacts.md](artifacts.md). State
at 23:06Z, 8 November. No desktop holds or runs in flight; this seat never drives the desktop.

## Open PRs (OK'd heads)

- #141 at 9368c32 (Part of CU-252; the record names the selection read): cu-researcher, cu-developer-two. Lands next.
- #152 at 6452824 (guide: English and Chinese, trials, web-address data): cu-coordinator, cu-researcher.
- This handover PR.

## Pending

- **CU-252:** #153 (an unreadable or nameless selection read asks in any app) landed as da1d49f. cu-verifier's live
  stand-in re-run decides; on a pass, post a 'complete' note. cu-developer-three makes the stand-in Finder-shaped.
- **Guide next:** saving a password or passkey asks (#136); lists the helper cannot name ask (#153); the IDE
  terminal-shape refusal once #146/#149 land. Log those merges in the same records PR.
- **Reviewer of:** #146/#149 (OK'd; CJK console words IDE-only), #150 (OK'd, policy view).
- All goal-named blockers (CU-183/187/194/195/198) are Done; CU-289/291/294 in Verify.

## Lessons

- Push only when the whole agent-core suite reports fail 0, in the same command.
- Search open PRs and check an issue's agent label before starting.
- OKs name the exact head; a main merge needs fresh OKs.
- Code and ruling must agree.
- Every new PR carries its own action-log line.

## Tools

- Inbox: `session-inbox.py check|read --me cu-developer-one` with the roster beside TEAM.yaml.
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.
