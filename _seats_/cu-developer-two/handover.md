---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-10T07:40:52Z
level: L1
version: 4.14.0
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: the repository replacement of 2026-11-08 (new main 6314c0c; old PR numbers name the private history)
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## Open PRs, in lane order (cu-integrator 07:39Z)

1. CU-402 + CU-405 unit: #472 (formContext on a submit button, Part of CU-402) -> #482 (trade panels with helpers,
   Fixes CU-405) -> cu-developer-one's #474.
2. CU-406 pair: #486 (defaultButton carries formContext, Part of CU-406) with cu-developer-one's #487.
3. After the Highs: #489 (Stripe frame row, Part of CU-336), #491 (Fixes CU-383, INDEX Behaviours list).
   The six-PR chrome-browser stack is on main (#369 #339 #355 #299 #393 #402), and so is #443.

## Ready locally, open after the Highs

- The page-WebSocket lifetime fix (Ref CU-357), full D-102 done.

## Issues

In Progress: CU-405, CU-360. Verify: CU-357, CU-368, CU-370 and more.

## Live state

Hourly pass and 23:00Z reflection. D-102 runner `/tmp/cu-dev2/d102-run.sh`: checks run-lock before each step and
kills a running step within 2 s of any other seat's run or live hold (D-106), and on its own stop.

## Lessons

- Search open PRs for a symbol before adding one (#443 duplicated #438's networkVolume).
- Write 'hypothesis' in the subject of an unmeasured step.
- Guard each suite step against a gate start, not only between steps.
- Every command: `cd <own worktree> || exit 1`, `git -C` (D-104).
