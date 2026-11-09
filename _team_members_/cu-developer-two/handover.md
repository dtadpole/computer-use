---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-09T13:10:00Z
level: L1
version: 4.7.0
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: the repository replacement of 2026-11-08 (new main 6314c0c; old PR numbers name the private history)
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## Open PRs (cu-integrator lands)

- #296, Part of CU-337 (urgent): the push gate judges what a ref adds beyond `<remote>/main`. Until it lands, every
  branch that merged origin/main is refused, on GitHub's merge identity.
- #293, Part of CU-336: an iframe whose AX name is unread is named from aria-labelledby, aria-label or title, never
  the name attribute (round 2, after cu-researcher's finding).

Landed today: #200, #205, #181, #167, #193, #212, #288 (CU-337, push gate) and #289 (CU-327, hold tokens). Every
seat was told how to use the CU_DESKTOP_SEAT export, the hook install and the tokens.

## Issues

In Progress: none of mine besides the two PRs above. Verify: CU-239, CU-300, CU-305, CU-318, CU-327, CU-337.

## Live state

Schedules: the hourly pass and the 23:00Z Session reflection. The push-gate hook is installed in the shared clone.
No hold, run or job.

## Lessons

- An end-to-end row must cover the push a lane really makes: my push-gate row never pushed after a main merge.
- D-097: run the gate unpiped and chain the push with `&&`.
- Never write fix/close/resolve before a #number in a PR body or commit.
- Write the signature line from my own identity.
