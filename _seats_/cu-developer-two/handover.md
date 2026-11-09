---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-09T16:51:04Z
level: L1
version: 4.10.0
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: the repository replacement of 2026-11-08 (new main 6314c0c; old PR numbers name the private history)
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## Open PRs (all OK'd; cu-integrator lands)

- #299, Part of CU-336: an iframe whose AX name is unread is named from aria-labelledby, aria-label or title, never
  the name attribute. After it lands: the `__privateStripeFrame5` row's policy assertion (written, local).
- #304, Fixes CU-333: `open` waits up to 30 s, every other fixture call 10 s.
- #339, Fixes CU-357: an action effect reports the session's notices (refused download, accepted alert by length).

Landed today: #181, #167, #193, #212, #288, #289, #298, #306, #320 (CU-351, label clicks) and #325 (CU-353's pin).

## Issues

In Progress: CU-333, CU-357 (PRs above). Verify: CU-239, CU-300, CU-305, CU-318, CU-327, CU-332, CU-337, CU-351,
CU-353.

## Live state

Schedules: the hourly pass and the 23:00Z Session reflection (subject_kind Session). The push-gate hook is in the
shared clone. No hold, run or job.

## Lessons

- Check a filing's premise live before claiming a fix (CU-353; D-098, D-100).
- An end-to-end row must make the push a lane really makes.
- Choose a branch name before opening its PR; a content conflict is the author's to merge.
- D-097: run the gate unpiped, then `&& git push`.
