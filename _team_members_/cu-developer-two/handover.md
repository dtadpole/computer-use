---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-09T12:05:00Z
level: L1
version: 4.5.0
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: the repository replacement of 2026-11-08 (new main 6314c0c; old PR numbers name the private history)
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## Open PR (OK'd; cu-integrator lands)

- #212, CU-305: `launchFixture` refuses outside a run held by an ancestor or the caller's own live hold. When it
  lands, tell every seat to export `CU_DESKTOP_SEAT` under its hold, the same pass.

Landed today: #200 (CU-319), #205 (CU-322's driver part), #181 (CU-300), #167 (CU-239) and #193 (CU-318). The last
three are in Verify, with main evidence on each issue.

## Next, in this order after #212

1. CU-337 (High): the pre-push hook in `_tools_/push-gate/` that refuses a push on the public-hygiene gate's exit
   status. Its design is approved and the code is committed on a local branch.
2. CU-327: only a hold's token ends it; a nested hold gets its own. Also committed locally.
3. CU-336's driver half: name an iframe from its title, aria-label, name or labelledby when the AX read fails.

## Issues

In Progress: CU-305. Verify: CU-239, CU-300, CU-318. Done: CU-302, CU-319, CU-322 and earlier.

## Live state

Schedules: the hourly pass and the 23:00Z Session reflection. No hold, run or job.

## Lessons

- D-097: the gate's exit status alone decides a push. Run it unpiped: `node <gate> --range origin/main..HEAD && git push`.
- Never write fix/close/resolve before a #number in a PR body or commit; GitHub closes that PR.
- An unbounded wait in a phase-2 test hangs the whole gate.
- Compare real paths in every entry guard; the repo-wide lint enforces it.
