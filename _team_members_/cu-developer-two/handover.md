---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-09T10:50:00Z
level: L1
version: 4.4.0
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

- #212, CU-305: `launchFixture` refuses outside a run held by an ancestor or the caller's own live hold. When it
  lands, tell every seat to export `CU_DESKTOP_SEAT` under its hold, the same pass.
- #167, CU-239: the MCP re-exec parent listens before its child exists.
- #193, CU-318: peer-boundary's accepted-window row waits past a 1500 ms window. Its phase 2 re-runs; the hang was
  in the helper step, which never runs this file.

Landed today: #200 (CU-319), #205 (CU-322's driver part) and #181 (CU-300, in Verify).

## Next

1. CU-327, after #212: only a hold's token ends it; a nested hold gets its own. The code is committed on a local
   branch with its rows and mutants; push it and open the PR.
2. CU-336's driver half: name an iframe from its title, aria-label, name or labelledby when the AX read fails.

## Issues

In Progress: CU-239, CU-305, CU-318. Verify: CU-300. Done: CU-302, CU-319, CU-322 and earlier.

## Live state

Schedules: the hourly pass and the 23:00Z Session reflection. No hold, run or job.

## Lessons

- An unbounded wait in a phase-2 test hangs the whole gate; bound every wait for a hello, a reply or an exit.
- Records PR bodies name issues without Fixes or Part of; the bridge reads those keywords.
- Pass a helper field to agent core only as an exact boolean.
- macOS has no `timeout` command.
