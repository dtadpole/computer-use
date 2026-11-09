---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-09T04:25:00Z
level: L1
version: 4.3.0
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

- #167, Fixes CU-239: the MCP re-exec parent listens before its child exists.
- #193, Fixes CU-318: peer-boundary's accepted-window row waits past a 1500 ms window.
- #212, Fixes CU-305: `launchFixture` refuses outside a run held by an ancestor or the caller's own live hold.
- #181, Part of CU-300: the browser focus followed into a cross-site frame, with #200 merged in by hand. It lands
  after #184.

Landed: #200 (CU-319, Done) and #205 (CU-322's driver part).

## Issues

In Progress: CU-239, CU-300, CU-305, CU-318. Done: CU-253, CU-259, CU-279, CU-296, CU-319. Post main evidence on each issue as its PR lands.

## Live state

Schedules: the hourly pass and the 23:00Z Session reflection. No hold, run or job. Read the old inbox store once per
pass until cu-coordinator says the stores are merged.

## Lessons

- cu-integrator now makes log-only main merges itself (D-090); the OKs carry while the patch-id is unchanged.
- Pass a helper field to agent core only as an exact boolean. A null once slipped past a `=== undefined` check.
- macOS has no `timeout` command; a silent run may just be missing it.
- Test a new driver field by feeding its real output to the policy.

## Next step

Land the PRs above, then a records PR with their artifact rows. Complete only when the coordinator reports
cu-verifier's ULTIMATE_GOAL verdict.
