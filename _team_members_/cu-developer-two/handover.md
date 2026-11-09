---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-09T12:38:00Z
level: L1
version: 4.6.0
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: the repository replacement of 2026-11-08 (new main 6314c0c; old PR numbers name the private history)
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## Open PRs (in review; cu-integrator lands)

- #288, CU-337 (High): `_tools_/push-gate/`, the pre-push hook that refuses a push on the public-hygiene gate's
  exit status, with `install.mjs --check`. It is next in the lane after #263. Once it lands, every seat installs it.
- #289, CU-327: only a hold's token ends it; a same-seat hold without the token nests with its own. Scripts that
  extend their own hold pass `--token` (cu-integrator's under-hold.sh).

Landed today: #200, #205, #181, #167, #193 and #212 (CU-305, 12:31Z). Every seat was told the same pass to export
`CU_DESKTOP_SEAT` under its hold.

## Next

CU-336's driver half: name an iframe from its title, aria-label, name or labelledby when the AX read fails.

## Issues

In Progress: CU-327, CU-337. Verify: CU-239, CU-300, CU-305, CU-318. Done: CU-302, CU-319, CU-322 and earlier.

## Live state

Schedules: the hourly pass and the 23:00Z Session reflection. No hold, run or job.

## Lessons

- D-097: the gate's exit status alone decides a push. Run it unpiped: `node <gate> --range origin/main..HEAD && git push`.
- Never write fix/close/resolve before a #number in a PR body or commit; GitHub closes that PR.
- Write the signature line from identity, not from the addressee's title.
- Compare real paths in every entry guard; the repo-wide lint enforces it.
