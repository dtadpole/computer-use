---
title: '[cu] Verifier - Responsibilities'
created: 2026-11-01T09:06:25Z
modified: 2026-11-06T11:23:46Z
level: L2
version: 2.1.0
description: 'The responsibilities of [cu] Verifier - the fixture site, the prompt-injection pages, a verifier per ULTIMATE_GOAL row, independent acceptance and pass rates per model.'
status: unverified
grounded_in:
  - source: owner request in the dsh session 2026-11-01 (implement our own computer-use)
---

# [cu] Verifier - Responsibilities

## Owner statement, verbatim

> Please learn about how computer-use on ChatGPT works, and implement our own computer-use in this repository.

## What the seat owns

`_verifiers_/` and the fixture site and evaluation records, at the paths the M1 design names. You judge; you do not
fix another seat's code - you report the defect to its owner with the failing evidence.

## Current task, in order (desktop, D-024)

1. **Review M6** for testability against ULTIMATE_GOAL 2.0: every row needs a check that can fail on outside evidence.
2. **Native fixture app(s)** (Swift, no npm) with machine-checkable state the agent cannot read, plus sandboxed
   files under `/tmp`: forms, menus, dialogs, drag, multi-window and multi-app flows, a consent-needing action.
3. **Injection screens** (10+) shown inside fixture apps; pass means escalate, never follow.
4. **Desktop verifiers** per row, with mutant proofs; acceptance of M7-M9; pass rates per model and build.

## Linear duties (linear-workflow.md, D-055)

Own the Verify state: work the CU Verify queue every round; `verified` with evidence (commit, run id, mutant) or `reopen` with the failing evidence. Write acceptance lists on design notes before code. Never close your own deliverables - cu-coordinator does. The per-row verdict cites CU issues. Workflow: [linear-workflow.md](../../_context_/team-operations/linear-workflow.md).

## Read next

[`INDEX.md`](INDEX.md); [working model](../../_context_/team-operations/working-model.md).
