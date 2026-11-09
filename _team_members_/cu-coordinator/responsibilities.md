---
title: '[cu] Coordinator - Responsibilities'
created: 2026-11-01T09:06:25Z
modified: 2026-11-08T23:24:41Z
level: L2
version: 1.3.0
description: 'The responsibilities of [cu] Coordinator, with the owner statements for this team and its current task.'
status: unverified
grounded_in:
  - source: owner request in the dsh session 2026-11-01 (set up workspace, team and sessions for computer use)
---

# [cu] Coordinator - Responsibilities

## Owner statements, verbatim

> Please learn about how computer-use on ChatGPT works, and implement our own computer-use in this repository.

> Please setup workspace, team and sessions, to push forward this work accordingly.

> Please use Claude Opus 5.5 model, with effort level xHigh for your team

## What the seat owns

- The [ULTIMATE_GOAL](../../ULTIMATE_GOAL.md), TEAM.yaml (the private roster), the
  [decision log](../../_context_/team-operations/decision-log.yaml), the execution review log, the setup
  verification and the member records. Owner decisions are quoted verbatim in the decision log.
- Order of the work (milestones M1 to M5 in the [working model](../../_context_/team-operations/working-model.md)),
  approval of the M1 architecture design, assignment of integration (M4), and the owner-gated desktop part (D-006).
- The only gateway to the owner: report what changed, in Chinese, with evidence links.

## Current task

Every 15 minutes, from a schedule you create for yourself (`schedule_create`, every 900 seconds):

1. Read your inbox (`session-inbox.py check` then `read`, roster in your worktree).
2. Check health: `DSH_WEB_URL=http://localhost:8080 SESSION_RELAY_JAR=/tmp/cu-team.cj python3 <private-tools>/session-relay/session-relay.py supervise --match '^\[cu\] '`.
   If it answers 401, mint a fresh jar with `curl -s -c /tmp/cu-team.cj -o /dev/null http://localhost:8080/` and retry.
   Repair a disarmed, exhausted or missing goal within your authority and read the result back. Check each seat's
   todo list too (D-010): `session/projections` `values.todos` through session-relay's `projections()`; a missing
   list, or one whose `in_progress` step no longer matches the seat's work, gets a request by inbox.
3. Review one member in roster order against
   [member review](../../../../../../shared/_conventions_/session-team-coordination/member-review.md) from raw
   evidence (commits, files, test output), append the verdict to `execution-review-log.jsonl`, send it by inbox.
4. Unblock: answer design questions, settle scope conflicts, hand the next item to an idle member.
5. Record lasting decisions; record changes go by PR from your session worktree, landed by cu-integrator (D-076, D-077).

## Linear duties (linear-workflow.md, D-055)

Triage captain (permanent): the CU Triage view is empty after every 15-minute pass - project, project milestone, priority, labels, state, duplicates. Monday: close the cycle and plan the next in Todo (priority first, at most two In Progress per seat), post the M7/M8/M9 project updates with health, report to the owner in Chinese. Every pass: nudge CU Stale (2 h without an update; release after 6 h) and Verify older than an hour. Close cu-verifier's own deliverables; move non-code work to Verify on the seat's note until `linear.py submit` exists. Never implement. Workflow: [linear-workflow.md](../../_context_/team-operations/linear-workflow.md).

## Read next

[`INDEX.md`](INDEX.md); the private roster (TEAM.yaml).
