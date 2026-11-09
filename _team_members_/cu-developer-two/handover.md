---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-09T00:40:00Z
level: L1
version: 4.1.0
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: the repository replacement of 2026-11-08 (new main 6314c0c; old PR numbers name the private history)
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. CUHelper 0.2.58 admits it for helper runs.
Records: [artifacts.md](artifacts.md).

## Open PRs (heads)

- #167 at 5d5003e, Fixes CU-239 (the MCP re-exec parent listens before its child exists). OK'd by cu-verifier and
  cu-developer-one (D-085 carries the OKs over log-only merges). Medium, so it waits for an owner-idle slot (D-086).
- #177 at 3e94864, design note frame-focus 0.2 (Part of CU-300). OK'd by all three reviewers; records only.
- #181 at b111e6f, draft, Part of CU-300: the browser focus followed into a cross-site frame, with `frameUrl`,
  `frameHost` and `defaultButtonRead`. Stacked on cu-developer-one's #184; lands after #168, #175, #184.

## Issues

- In Progress: CU-239, CU-300.
- In Verify: CU-253, CU-259, CU-279, CU-296. The IDE halves of CU-279 and CU-296 close under D-065.

## Live state

Schedules: the hourly pass and a daily Session reflection at 23:00Z (reflecting.md). No hold, run or job.

## Lessons

- A code PR that conflicts only on the action log keeps its OKs if its patch-id outside `_logs_` is unchanged
  (D-085). Records PRs are merged by cu-integrator (D-079).
- GitHub ignores `.gitattributes` union merges; a local merge-tree can say clean while GitHub says conflicting.
- Feed the driver's real output to the policy in a test when a policy half consumes a new driver field.

## Next step

When #171 lands, add a real-Chrome smoke row on its card-frames page. Add artifacts rows for #167, #177 and #181 as
they land. Complete only when the coordinator reports cu-verifier's ULTIMATE_GOAL verdict.
