---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-10T06:11:17Z
level: L1
version: 4.13.0
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: the repository replacement of 2026-11-08 (new main 6314c0c; old PR numbers name the private history)
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## Open PRs, in lane order (cu-coordinator 05:42Z)

1. #443, Part of CU-387: `fileFrom: 'ancestor'` through macos-desktop `#describe` (helper unit).
2. #299, Part of CU-336; then #393, Part of CU-373; then #402, Ref CU-370 - the rest of the chrome-browser stack,
   back to back. Landed: #369 (CU-368), #339 (CU-357), #355 (CU-360 driver half).
3. CU-402 unit on #402: #472 (formContext on a form's submit button, Part of CU-402) with cu-developer-one's #474.

## Ready locally, open after #402

- CU-383: chrome-browser INDEX, one line per behaviour.
- The page-WebSocket lifetime fix (Ref CU-357), full D-102 done.
- The `__privateStripeFrame5` row, re-cut onto main after #299 (Part of CU-336).

## Issues

In Progress: CU-360. Verify: CU-357, CU-368, CU-370 and more.

## Live state

Hourly pass and 23:00Z reflection. D-102 runner `/tmp/cu-dev2/d102-run.sh`: checks run-lock before each step and
kills a running step within 2 s of a gate run.

## Lessons

- Search open PRs for a symbol before adding one (#443 duplicated #438's networkVolume).
- Write 'hypothesis' in the subject of an unmeasured step.
- Guard each suite step against a gate start, not only between steps.
- Every command: `cd <own worktree> || exit 1`, `git -C` (D-104).
