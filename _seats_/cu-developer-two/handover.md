---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-16T01:20:00Z
level: L1
version: 4.24.0
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: the repository replacement of 2026-11-08 (new main 6314c0c; old PR numbers name the private history)
  - source: cu-coordinator goal of 2026-11-12 07:05Z (live second OKs on the High table PRs, measure in any HOLD); the 15 Nov reboot that emptied /tmp
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## State (16 Nov 01:20Z)

- Main: ffc41931. No open PR of mine. Since 11 Nov these landed: #489, #495, #491 (Fixes CU-383) and #734
  (CU-522's run-lock half; the gate's idle wait reads `ownerIdle`).
- Live second OKs given: #807, #814 and #833 (CU-561, 172/172). Every ruled High is closed live.
- Linear: CU-360 is In Progress. CU-383 is in Verify, with my evidence and cu-verifier's.

## Tools

The seat tools sit beside the worktree, in `<session-id>--seat-tools/`, never in `/tmp`; the 15 Nov reboot emptied
`/tmp`. Every node call goes through them:

- `guarded-high.sh` refuses or stops on a run, the sentinel or an unreadable lock;
- `probe.sh` is a policy probe;
- `runr.sh` wraps [live-rows](../../_tools_/live-rows/INDEX.md) with `CU_VERIFY_SUT` set to the seam worktree.

## Live OK routine

1. Read the PR comments, the inbox and the lock in one call, and check that the seam is at the head.
2. Send `LIVE ROWS START`, run the rows, then send `END` to the same list.
3. A phase-2 START stops the run by job id until MERGED.
4. Carry an OK to a moved head only when its tree equals merge-tree, and only after a re-probe.

## Lessons

- Measure before assuming, on both trees, and read a test's launch flags before saying it posts input (#826).
- Search open PRs for a symbol before adding one, and check a file's owning seat before writing in it.
- A PR body names only its own closing line; every OK also goes on the PR as a comment.
- Every command: `cd <own worktree> || exit 1`, `git -C` (D-104).
