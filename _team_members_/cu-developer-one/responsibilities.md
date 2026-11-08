---
title: '[cu] Developer One - Responsibilities'
created: 2026-11-01T09:06:25Z
modified: 2026-11-07T02:20:40Z
level: L2
version: 3.2.0
description: 'The responsibilities of [cu] Developer One - the architecture design and the agent core (action schema, loop, model adapters, policy hooks, trajectory).'
status: unverified
grounded_in:
  - source: owner request in the dsh session 2026-11-01 (implement our own computer-use)
---

# [cu] Developer One (agent core) - Responsibilities

## Owner statement, verbatim

> Please learn about how computer-use on ChatGPT works, and implement our own computer-use in this repository.

## What the seat owns

`_designs_/` (the contract) and the agent-core code with its `_tests_` suites, at the paths the design names. Since
D-039 they live in github.com/dtadpole/computer-use (worktree `~/computer-use--cu-developer-one`, landed by
cu-integrator, issues in Linear team CU); this seat's records stay here in `_projects_/computer-use/`.

## Done

M1 design approved (D-015); agent core with tests and the M2 slice accepted by cu-verifier (D-018, a1825fca5);
consent end to end, inspector, bounds and cancel, origin on consent requests, max_cost as a true ceiling (841b741fc).
M6's desktop design and its agent-core changes. For M7-M9: the no-app-window follow-ups (CU-104, CU-113, CU-121),
the ANSWER line (CU-123), the real cursor (CU-125), and the consent routes live runs exposed - keyboard activation
and the tabbed type (CU-135), press and drop (CU-140), the save panel's folder (CU-139); each in
[artifacts.md](artifacts.md).

## Current task (the coordinator's goal)

> Own the [cu] agent core and design for the remaining M7-M9 and continuity work: CU-113 and CU-121 (no-app-window
> follow-ups), CU-104, the D-057 strict ANSWER line in the agent's final answer, robustness found in live runs;
> design notes before contract or safety changes, reviewed by cu-verifier and cu-researcher; keep the owner's user
> guide (CU-115) and action policy true to every live finding; every synthetic input through CUHelper (D-056).

## Linear duties (linear-workflow.md, D-055)

Agent core and design issues: `queue`, `take`, at most two In Progress. Contract or safety changes start with a design note on the issue, reviewed by cu-verifier and cu-researcher. Split work across seats into sub-issues. PR title `Fixes CU-n` only when complete, `Part of CU-n` otherwise; `note` evidence at each step; `release` with where you stopped. Workflow: [linear-workflow.md](../../_context_/team-operations/linear-workflow.md).

## Read next

[`INDEX.md`](INDEX.md); [working model](../../_context_/team-operations/working-model.md);
requirements R1..R53 in the four `implications-*` articles of [the study](../../_context_/chatgpt-computer-use/INDEX.md).
