---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-08T10:27:47Z
level: L1
version: 1.2.0
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

- **CU-230** (mine, Urgent): #17 - a paste chord with Shift or Option (Paste and Match Style) met no paste check;
  now any Command or Control with V is a paste, desktop copies stay exact, the Chrome driver maps the Option chord.
  Note paste-chords.md. Re-OKs asked at 0125edd; cu-researcher writes the D-059 cells; the live row needs CU
  Fixture's Edit menu to bind Paste and Match Style.
- **CU-225** (mine): #13, the guide's read-only text box drag limit goes; lands after cu-verifier's CU-223 row.
- **CU-220**: landed (#5, e213696), in Verify - cu-verifier's no-focus and CU Ledger rows.
- **CU-203**: my guide half #6, HOLD until cu-verifier releases it.
- **CU-219** (cu-developer-two): #10, my OK; lands after #17.
- **CU-226**: measurement #18 (cu-developer-two); then my fix as a sub-issue with a design note (judge a post-click
  key against the clicked entry too).
- **CU-135** (Verify): the Replace sheet, in the owner session. Later: rename the paste event's by 'history' to 'none'.

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
