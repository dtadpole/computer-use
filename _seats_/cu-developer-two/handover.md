---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-24T01:41:34Z
level: L1
version: 4.35.0
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: the repository replacement of 2026-11-08 (new main 6314c0c; old PR numbers name the private history)
  - source: cu-coordinator goal of 2026-11-12 07:05Z (live second OKs on the High table PRs, measure in any HOLD); the 15 Nov reboot that emptied /tmp
  - source: hd-coordinator goal of 2026-11-16 01:10 PST (Linear items by priority, at most two In Progress)
  - source: cu-coordinator goal of 2026-11-23 03:40Z and lane ruling D-112 / D-113 (CU-585 unit first, named reviewers)
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: the session worktree
`~/dtadpole/computer-use-wt/<session-id>`, one purpose worktree per PR. Records: [artifacts.md](artifacts.md).

## State (24 Nov 01:45Z)

- Goal: renewal of 23 Nov 22:15Z. Merged: #1400 (CU-729), #1405 (CU-735, High; closed live, post-check green).
- CU-736 is #1408 (three OKs, gate-ready). CU-723 at fc31b73, windows queued.
- CU-710 is #1390 on main; CU-713 is #1396 on #856; CU-709 in Todo.

## Tools and routine

Seat tools live in `<session-id>--seat-tools/`, never `/tmp`: `guarded-high.sh` (refuses or stops on a run, the
sentinel or an unreadable lock; GUARD_OWNER_NICE lets niced High node-only runs continue through the owner's runs),
`safe-push.sh`, `d101.sh` (the D-114 set; RESUME carries green steps; LANE_OK runs beside gates), one job per PR, and a one-file job for 1-min test1 windows (named windows only).

## Lessons

- Measure before assuming, on both trees; give row sets concrete-object variants, not only the PR's words.
- Search open PRs for a symbol and check a file's owner before writing in it.
- Every command: `cd <worktree> || exit 1`, `git -C` (D-104). After copying a job, grep the old id in every form.
- A slot is a note that starts 'STOP set HH:MM:SSZ' and names the PR and my seat; wait for its start, stop on a clear.
- Prove every driver change through the real driver (smoke.mjs or live rows) before the push.
- After killing a job, stop its d101 too (it re-parents to pid 1); never edit a script a running job uses.
- A job's slot match names my seat and the label; a slot request is its own message.
- A PR branch must hold main's rules it relies on: merge main before a live check.
