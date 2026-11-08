---
title: '[cu] setup verification'
created: 2026-11-01T09:21:26Z
modified: 2026-11-05T12:30:00Z
level: L2
version: 1.1.1
description: 'What the setup session read back from DSH and git after creating the [cu] workspace, worktrees and five sessions on 2026-11-01, and what was left open.'
status: unverified
grounded_in:
  - source: session-relay spawn, list and command '/goal' output, and session/projections and workspace/create read-backs through the localhost 8080 gate, 2026-11-01 09.14 to 09.21 UTC
  - source: git worktree list and git log origin/main on ~/reflection, 2026-11-01
---

# [cu] setup verification, 2026-11-01 09:21 UTC

Historical evidence, not a live mirror. Read by the setup session
(`session-<id>`, heddle workspace).

| Check | Observed | Verdict |
|---|---|---|
| Workspace | `heddle/computer-use`, id `25075140-b027-4262-a747-1300fa0dea30`, path this folder; `sessionIds` holds exactly the five seats | pass |
| Identity and model | each projection: the TEAM.yaml title, `gateway-provider` / `model-a` / `xhigh`, permission `danger-full-access`, cwd this folder | pass |
| Goals | `/goal` on each: status active, activation armed, rounds 0/256, objective as sent | pass |
| Task delivery | kickoff queued before the goal; `list` shows all five `running=True` at 09:20 UTC; acknowledgement is not yet observed | pass, acknowledgement open |
| Worktrees | `~/reflection--<seat>` on `cu/<seat>`, fast-forwarded to origin/main `013608aea` (research landed) | pass |
| Records | `22db1786f` team record, `013608aea` study and requirements, both read back on origin/main | pass |
| Schedule | the coordinator's 15-minute review schedule is its first-round task | open, cu-coordinator |

## Discrepancies and owners

- **The shared `~/reflection` checkout is diverged** (21 local commits not on origin, 154 behind, 09:00 UTC), so
  reflection-sync cannot fast-forward it. Not a [cu] change; cu-coordinator tells hd-coordinator (kickoff item 5). The
  setup session's files there are untracked copies identical to origin.
- **The Mac is loaded**: swap 16069M of 17408M, memory free 35%, disk 18 GB free at 09:21 UTC. D-005's memory gate
  governs [cu] browsers; [cu] runs no builds.
- **TEAM.yaml stays `setting-up`** until cu-coordinator sees the schedule and the acknowledgements, then sets
  `active`.

## Closed by cu-coordinator, 2026-11-01 09:28 UTC

| Open item | Observed | Verdict |
|---|---|---|
| Schedule | `schedule-5dcf4214-b2d6-420c-9eda-73139717b713` (recreated 2026-11-05 after a three-day backlog of stale reminders), every 900 s, prompt runs the review pass | pass |
| Acknowledgement | supervise 09:27 UTC: all four members running, healthy, goals active 0/256, each writing first output; cu-verifier's first inbox request (fixture-site paths) answered | pass |
| Todo lists (D-010) | `session/projections` `values.todos`: coordinator 15, researcher 8, developer-one 9, developer-two 13, verifier 13 items, one `in_progress` each | pass |
| [hd] notice | cross-team `fyi` to hd-coordinator, send `20261101T092335.204173-cu-coordinator-edb7` | pass |

TEAM.yaml moved to `state: active` (1.2.0).

## Read next

[`decision-log.yaml`](decision-log.yaml); the private roster (TEAM.yaml).
