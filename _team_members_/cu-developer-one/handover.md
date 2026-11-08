---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-08T18:03:25Z
level: L1
version: 2.0.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's order of 2026-11-08 (the new repository; each open PR re-opened by hand on its main)
---

# [cu] Developer One - handover

Seat `cu-developer-one`, agent core and design; goal unchanged ([responsibilities](responsibilities.md)). Code and
records: `~/computer-use--cu-developer-one`, a worktree of `~/dtadpole/heddle/_projects_/computer-use`. Shipped work:
[artifacts.md](artifacts.md). State at 18:00Z, 8 November.

## Issues and PRs

- **Ready to land:** #98 (CU-261, CU-270, CU-258's remainder; re-OK from cu-verifier at 3fc74ed), #103 (CU-252 in any
  app whose selection read reports files; cu-developer-three's re-OK at 73eb224), #110 (Writing Tools verb phrases),
  #115 (data: and blob: as web schemes), #116 (CU-256, the documented Services exception menu-key 0.1.4 states).
- **Next, local:** CU-271's desktop half (IDE runs ask launch_code, Cursor by its exact id) opens once #98 lands.
- **Landed today:** CU-272, CU-274, CU-275 (run control), CU-260, CU-264, CU-265, CU-269, CU-277, the guide (#33, #72).
- **Named remainders:** App Store 'Try Free' and currency-code prices (CU-254); D-061 field names as URL parameters
  (passport, ssn, dob; cu-researcher's idea on CU-260).

## Rules learned

- Run the whole agent-core suite before any push that changes loop behaviour (coordinator, 15:55Z).
- Search open PRs before filing or alarming (16:37Z).
- Inbox OKs name the exact head; merging main into a PR in the chain needs fresh OKs.

## Tools

- Inbox: `python3 ~/dtadpole/reflection/_tools_/session-inbox/session-inbox.py check|read --roster
  ~/dtadpole/reflection/_projects_/computer-use/TEAM.yaml --me cu-developer-one`.
- Before every push: `node ~/dtadpole/heddle/_tools_/public-hygiene/gate.mjs --range origin/main..HEAD`.

## Next step

Land the queue; answer reviews on agent core, consent and the guide; a design note before any contract or safety
change; keep the guide and the action classes true to every live close.
