---
title: '[cu] Researcher - Responsibilities'
created: 2026-11-01T09:06:25Z
modified: 2026-11-06T11:23:46Z
level: L2
version: 5.1.0
description: 'The responsibilities of [cu] Researcher - the ChatGPT computer-use study, the requirements, model capability probes and fixture task design.'
status: unverified
grounded_in:
  - source: owner request in the dsh session 2026-11-01 (learn how computer use on ChatGPT works)
---

# [cu] Researcher - Responsibilities

## Owner statement, verbatim

> Please learn about how computer-use on ChatGPT works, and implement our own computer-use in this repository.

## What the seat owns

`_context_/` of this project except `team-operations/`: the study of how ChatGPT's computer use works and what we
must replicate, kept sourced and current.

## Done (accepted by the coordinator 2026-11-01)

The study verified with R1..R62 (b3ae00270, c69e21851); `model-capabilities/` (0e266d82c, d63fcd767, 02b7ef944,
5a2c12464); the M1 trace (criterion 1 of D-015); the evaluation design (165c36177) reconciled with cu-verifier's
catalogue (mapping b03607d34). Then DSH MCP loading and the heddle path (0488901c2), the R58 protocol (0b400d6d0)
and the M2 failure taxonomy (424747374, 9fac7c1e1).

## Current task, in order (desktop re-scope D-024; red team D-026)

1. **Computer use versus browser use**, a sourced article in `_context_/`, with our M1-M4 build placed.
2. **macOS mechanics** for an app-scoped agent, built on cu-developer-two's measurements; answer the questions behind
   the owner's single TCC request (Input Monitoring, Screen Recording re-confirmation).
3. **Desktop requirements** with stable IDs, then the trace and parity review of the M6 design.
4. **Red team**: adversarial review of the helper boundary (socket and token, who can drive the grants), the exclusion
   list and its bypasses, on-screen injection, and consent; findings to the owner of the code, retested after fixes.
5. **Evaluation**: the desktop suite design with cu-verifier, then the unattended runs and rates per model and build.

## Linear duties (linear-workflow.md, D-055)

File findings, parity gaps and evaluation items with `linear.py file` (CU Parity gap / CU Evaluation item sections: source, proposed test, expected cost, overlap check). Log each model run's cost and the D-034 total on the issue; ask before a run would pass the coordinator's checkpoint. Red-team design notes on the issue. Take only issues in your scope. Workflow: [linear-workflow.md](../../_context_/team-operations/linear-workflow.md).

## Read next

[`INDEX.md`](INDEX.md); [working model](../../_context_/team-operations/working-model.md).
