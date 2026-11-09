---
title: '[cu] working model'
created: 2026-11-01T09:06:25Z
modified: 2026-11-08T23:42:00Z
level: L2
version: 3.3.0
description: How every [cu] seat works - its two worktrees, Linear, how records and code land, code rules, the Mac's limits, the inbox and the milestones.
status: unverified
grounded_in:
  - source: owner request in the dsh session 2026-11-01 (set up workspace, team and sessions for computer use)
  - source: _context_/team-operations/decision-log.yaml D-002 to D-007, D-026, D-039
---

# [cu] working model

Seats: TEAM.yaml (the private roster) and `_team_members_/<seat>/responsibilities.md`; decisions: [decision-log.yaml](decision-log.yaml).

## Where you work

Code and public records: this repository, main checkout `~/dtadpole/computer-use` (DSH workspace
"dtadpole/computer-use"), edited only in your session worktree `~/dtadpole/computer-use-wt/<session-id>` on a
`cu/<seat>-...` branch per change (D-039, D-077); CUHelper runs start there too since helper 0.2.58 (D-080). Private records (the roster, seat files, review log) stay in the reflection
bank, edited from your reflection session worktree. Never edit a main checkout; pass `workdir` to every shell call.
Write only your scope; another seat's files change through a message to it.

## Linear

Issues live in Linear (the team Linear workspace, team CU): `python3 <private-tools>/linear/linear.py --seat <seat>`
`queue` or `mine` to choose, `take` before you start, `note`, `ask` (owner question), `pr`, `release`; the verifier
closes with `verified` or `reopen`. linear-bridge delivers Linear events to your inbox as `[linear] ...`. States,
priorities, labels, PR words, cadence and each seat's duties: [linear-workflow.md](linear-workflow.md) (D-055).

## Landing a change

1. `git add <paths> && git commit` in one command, never `git add -A`; Conventional Commits.
2. Records: the same commit appends one English line, without session ids, to `_logs_/repo-actions/action-log.jsonl`
   (D-077); a records-only PR lands on phase 1 (D-076). Private records in the reflection bank go by PR there.
3. Code and records (main PR-only): run the public-hygiene gate over `origin/main..HEAD`, push a branch, open a PR
   whose title names `Fixes CU-n` or `Part of CU-n`, send cu-integrator a merge request; it gates and lands with
   `pr-merge.py` (D-026). Never push main or force-push.

Replies to the owner are Chinese; files, logs and inbox messages English.

## Code

- Node 24 and Swift (the macOS helper), no npm dependencies; browser-use code is vendored with provenance, never edited in place.
- Contract first: `_designs_/` before implementation.
- Every key function has a unit test in `_tests_/<suite>/` (`node --test`); every delivery claim a failing-capable
  check in `_verifiers_/<claim>/`. Every folder has an `INDEX.md` with frontmatter.
- Secrets never enter the tree, a log or a message (D-007).

## The Mac

Shared with the [hd] seats. Chrome only at 25% free memory, throwaway profiles under `/tmp/cu-<seat>-*` (D-005, D-014). Desktop control only through our helper app, in approved apps, never the exclusions; one announced
desktop run at a time under the desktop-run lock; input goes only to the fixture apps until the pause and exclusions hold live (D-024). No
VM or container. No tool call waits over 120 s. Never read `~/.dsh`, `~/Library`, `~/Documents`, `~/Desktop`,
`~/Downloads`; no home-rooted search.

## Goal and todo list

An armed goal and a live todo list per seat (D-010): re-issue `todo_write` first in every round.

## Inbox

Each round starts with `python3 <private-tools>/session-inbox/session-inbox.py check --roster TEAM.yaml --me <seat>`,
then `read`; reply with `send --reply-to` ([policy](../../../../../shared/_conventions_/session-inbox/message-policy.md)).
Report to the coordinator; owner questions go through `linear.py ask` or the coordinator.

## Milestones

| | Done when | Owners |
|---|---|---|
| M1-M4 | browser use, accepted 2026-11-01 (D-015, D-018, D-022, D-023) | all |
| M6 | desktop design approved: helper app, IPC, capture, input, accessibility, per-app approval, exclusions, input pause | developer-one, reviewed by all |
| M7 | helper and macOS driver: scripted runs pass (2026-11-05), live Claude runs pass fixture-app tasks | developer-two, -three, -one, verifier |
| M8 | desktop consent, exclusions, injection screens, take over, local-input pause, live view | developer-one, developer-two |
| M9 | DSH and heddle run desktop tasks; 20+ tasks, 10+ injection screens, rates per model | all |
