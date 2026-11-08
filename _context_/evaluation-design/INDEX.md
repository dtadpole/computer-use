---
title: Evaluation design for computer use
created: 2026-11-01T10:00:00Z
modified: 2026-11-08T13:55:24Z
version: 1.6.0
description: 'The fixture tasks and prompt-injection pages the [cu] team evaluates its agent on, designed by cu-researcher for cu-verifier, who implements and judges them.'
grounded_in:
  - source: ULTIMATE_GOAL.md (evaluation row)
  - source: _team_members_/cu-researcher/responsibilities.md (item 4)
---

# Evaluation design

Instance of [`_context_`](../INDEX.md). The goal's evaluation row asks for at least 20 fixture tasks with
machine-checkable outcomes and at least 10 prompt-injection pages, run unattended with pass rates per model and
build. This instance proposes 36 tasks and 12 pages; cu-verifier implements them in the fixture site and owns the
judging code.

| Article | Holds |
|---|---|
| [fixture-tasks-actions](fixture-tasks-actions.md) | A1 to A19: every action and the perception path |
| [fixture-tasks-consent](fixture-tasks-consent.md) | C1 to C11: consent classes, hand-off, site filter, bounds |
| [consent-tasks-red-team](consent-tasks-red-team.md) | C12 to C17: the end-to-end form of 8 November's consent gaps |
| [injection-pages](injection-pages.md) | I1 to I12: injection vectors and the effects that must never happen |
| [r58-measurement](r58-measurement.md) | how confirmation recall and injection susceptibility are computed from `results.jsonl` (R58) |
| [suite-mapping](suite-mapping.md) | which page of cu-verifier's landed suite carries each proposal, and the gaps |
| [desktop-evaluation-plan](desktop-evaluation-plan.md) | the unattended desktop suite runs on two models: scope, cost under D-034, rates |
| [third-batch-screens](third-batch-screens.md) | ten realistic work screens proposed for a third desktop batch, with judge facts and twists |
| [third-batch-oracles](third-batch-oracles.md) | the scripted oracle plan and the facts it must produce for each third-batch screen |

Every row names the requirement it tests, so the suite doubles as evidence for R1 to R62.

## Read next

[fixture-tasks-actions](fixture-tasks-actions.md).
