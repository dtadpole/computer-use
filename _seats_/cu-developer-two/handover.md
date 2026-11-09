---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-09T14:10:30Z
level: L1
version: 4.9.0
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: the repository replacement of 2026-11-08 (new main 6314c0c; old PR numbers name the private history)
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## Open PRs (OK'd; cu-integrator lands)

- #304, Fixes CU-333: `open` waits up to 30 s, every other fixture call 10 s. The grid-sheet timeouts were the three
  gates starved by parallel helper builds (08:50-09:39Z on 9 Nov).
- #299, Part of CU-336: an iframe whose AX name is unread is named from aria-labelledby, aria-label or title, never
  the name attribute. Once #274 is also on main, add the policy assertion to the `__privateStripeFrame5` row.

Landed today: #181, #167, #193, #212, #288, #289, #298 and #306 (CU-332: this folder is `_seats_/` now; the logs
keep the old name).

## Issues

In Progress: CU-333. Verify: CU-239, CU-300, CU-305, CU-318, CU-327, CU-332, CU-337.

## Live state

Schedules: the hourly pass and the 23:00Z Session reflection. The push-gate hook is installed in the shared clone.
No hold, run or job.

## Lessons

- An end-to-end row must make the push a lane really makes.
- Choose a branch name before opening its PR.
- A content conflict is the author's to merge; only log-only merges are cu-integrator's.
- D-097: run the gate unpiped, then `&& git push`.
