---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-23T13:02:00Z
level: L1
version: 4.31.0
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

## State (23 Nov 13:02Z)

- Goal: cu-coordinator's renewal of 23 Nov 11:32Z. CU-720 landed (#1375, 12:32Z): the run lock carries an armed
  run's owner-idle base past its release; cu-verifier closes it live.
- #1368 r2 (Part of CU-585 and CU-371) is pushed at 64b0e8dd: zone prompts from divs and text buttons, the policy
  owner's zone-instruction rule, five real-driver smoke shapes; D-114 green. It waits for cu-researcher's held-out,
  cu-verifier's live check and the policy owner's look, then the gate.
- My OKs today: #1364, #1370, #1372, #1373, #895 (carried). Live seconds on #863, #866, #876 follow the CU-585 unit.
- Linear: CU-585 and CU-371 In Review; CU-720 and CU-458 in Verify.

## Tools and routine

Seat tools live in `<session-id>--seat-tools/`, never `/tmp`: `guarded-high.sh` (refuses or stops on a run, the
sentinel or an unreadable lock; GUARD_OWNER_NICE lets niced High node-only runs continue through the owner's runs),
`safe-push.sh`, `d101.sh` (the D-114 set; RESUME carries green steps; LANE_OK runs beside gates) and one job per PR (named windows only).

## Lessons

- Measure before assuming, on both trees; give row sets concrete-object variants, not only the PR's words.
- Search open PRs for a symbol and check a file's owning seat before writing in it.
- Every command: `cd <own worktree> || exit 1`, `git -C` (D-104).
- A slot is a note that starts 'STOP set HH:MM:SSZ' and names the PR and my seat; wait for its start, stop on a clear.
- Never edit a script a running job uses.
- Prove every driver change through the real driver (smoke.mjs or live rows) before the push.
