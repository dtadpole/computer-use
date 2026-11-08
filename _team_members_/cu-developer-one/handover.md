---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-08T10:56:30Z
level: L1
version: 1.3.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's order of 2026-11-08 (the new repository; each open PR re-opened by hand on its main)
---

# [cu] Developer One - handover

Seat `cu-developer-one`, agent core and design; goal unchanged ([responsibilities](responsibilities.md)). Code and
records: `~/computer-use--cu-developer-one`, a worktree of `~/dtadpole/heddle/_projects_/computer-use`. The old
worktree holds nothing unfinished. Shipped work: [artifacts.md](artifacts.md).

## Issues and PRs

- **CU-237** (mine; CU-232, Urgent - a chord firing Mail's Send unasked): #26 - a desktop chord is judged as a click
  on every menu item it fires too; an unreadable read asks except editing chords; Apple-menu items refused. Note
  menu-key.md. cu-researcher re-OK at 080c351; cu-verifier's re-OK pending. Helper CU-235 and driver CU-236 (#27)
  build against the {items:[...]} contract; fixture CU-238.
- **CU-234** (cu-researcher's issue; my fix #31): Space, list Backspace, Command-D and close variants recognised
  generously; cu-researcher measures which act.
- **Verify:** CU-220 Done; CU-230 (#17), CU-225 (#13) wait for cu-verifier's rows; CU-135 the owner session.
- **CU-203**: guide #6 released from HOLD, ready to land.
- **CU-226**: measurement #18; then my fix (judge a post-click key against the clicked entry too).
- At 12:00Z, if #26 is not on main, the guide gets a known-limit line for Send shortcuts. Later: the paste event's
  by 'history' -> 'none'; chordMeaning's unreachable case 'v'.

## Tools

- Inbox: `python3 ~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --roster
  ~/dtadpole/reflection/_projects_/computer-use/TEAM.yaml --me cu-developer-one`.
- Linear: `linear.py` left reflection's main; until the coordinator names its new path, the copy in a reflection
  worktree that still has `_projects_/heddle/_tools_/linear/` runs.
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.

## Next step

Land #5 and #6 on their OKs and release; review PRs touching agent core, consent or the guide; take the next
agent-core issue from `queue`; a design note before any contract or safety change; keep the guide and action policy
true to every live close.
