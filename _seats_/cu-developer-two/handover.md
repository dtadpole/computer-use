---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-09T18:41:26Z
level: L1
version: 4.11.0
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
- #339, Fixes CU-357: an action effect reports the session's notices (refused download; an alert by length only).
- #355, Part of CU-360: a page's navigation to another app's scheme is a notice, with a best-effort stop
  (`launched` stays unknown). Its merge after #339 extends `noticeOf` to keep reason, stop and launched.

Landed today: #181, #167, #193, #212, #288, #289, #298, #304 (CU-333, open bound 30 s), #306, #320, #325.

## Issues

In Progress: CU-357, CU-360 (PRs above; CU-360's guide note drafted for cu-developer-one). Verify: CU-239, CU-300,
CU-305, CU-318, CU-327, CU-332, CU-333, CU-337, CU-351, CU-353.

## Live state

Schedules: the hourly pass and the 23:00Z Session reflection. No hold, run or stray process. LaunchServices does not
route a probe scheme to a scratch bundle, so the launch half of CU-360 is not measurable here.

## Lessons

- Add a control before reading a probe's negative (CU-360: LaunchServices, not Chrome, said no).
- Check a filing's premise live before claiming a fix (D-098, D-100).
- A scaled-down test bound must leave room for start-up on a loaded gate.
- D-097: run the gate unpiped, then `&& git push`.
