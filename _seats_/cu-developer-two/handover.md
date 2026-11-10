---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-10T10:46:10Z
level: L1
version: 4.16.0
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: the repository replacement of 2026-11-08 (new main 6314c0c; old PR numbers name the private history)
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## Open PRs (Medium lane, after the Highs)

- #495, Ref CU-357: a page's WebSocket claims a proxy refusal for the page's lifetime.
- #491, Fixes CU-383: chrome-browser INDEX Behaviours list, one line per issue.
- #489, Part of CU-336: the __privateStripeFrame5 row asks sensitive_data end to end.

On main: the six-PR stack (#369 #339 #355 #299 #393 #402), #443, and the form-context driver halves #472
(CU-402), #482 (CU-405) and #486 (CU-406, its policy half #487 in the lane).

## Issues

In Progress: CU-360. Verify: CU-357, CU-368, CU-370 and more. CU-402, CU-405 and CU-406 closed live. CU-409 (desktop side)
is cu-developer-three's #510 (OK'd at 2ff3d0d09); my #508 was closed for it (one desktop driver half, his file).

## Parity sweep (block 08:20Z, item 3)

Real loop and browser driver, one page per control. Typed pass (click, Return, Tab+Space, double-click) done: 62 rows,
0 off-parity. Next: the empty-field column, then input/link/div variants. High live rows take the browser slot first.

## Live state

Hourly pass and 23:00Z reflection. D-102 runner `/tmp/cu-dev2/d102-run.sh`: checks run-lock before each step and
kills a running step within 2 s of any other seat's run or live hold (D-106), and on its own stop.

## Lessons

- Search open PRs for a symbol before adding one (#443 duplicated #438's networkVolume).
- Guard each run step on the run-lock file (D-106).
- A PR body names only its own closing line; every OK also goes on the PR as a comment.
- Check a file's owning seat before writing in it.
- Every command: `cd <own worktree> || exit 1`, `git -C` (D-104).
