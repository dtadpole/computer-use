---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-09T13:40:00Z
level: L1
version: 4.8.0
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: the repository replacement of 2026-11-08 (new main 6314c0c; old PR numbers name the private history)
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## Open PR (OK'd; cu-integrator lands)

- #299, Part of CU-336 (re-cut of #293): an iframe whose AX name is unread is named from aria-labelledby,
  aria-label or title, never the name attribute. Once #274 is also on main, add the policy assertion to the
  `__privateStripeFrame5` row.

Landed today: #200, #205, #181, #167, #193, #212, #288 and #298 (CU-337, the push gate and its range fix), #289
(CU-327). Every seat was told about the CU_DESKTOP_SEAT export, the hook install and the hold tokens. The
--no-verify interim ended at 13:37Z.

## Issues

Mine in Verify: CU-239, CU-300, CU-305, CU-318, CU-327, CU-337. None In Progress.

## Live state

Schedules: the hourly pass and the 23:00Z Session reflection. The push-gate hook is installed in the shared clone.
No hold, run or job.

## Lessons

- An end-to-end row must make the push a lane really makes.
- Choose a branch name before opening its PR: renaming an open PR's branch closes it for good.
- D-097: run the gate unpiped, then `&& git push`.
- Write the signature line from my own identity.
