---
title: '[cu] Developer Three - Responsibilities'
created: 2026-11-02T08:50:00Z
modified: 2026-11-06T11:23:46Z
level: L2
version: 1.1.0
description: 'The responsibilities of [cu] Developer Three - the macOS helper app, the only process granted Screen Recording, Accessibility and Input Monitoring, and its side of the helper protocol.'
status: unverified
grounded_in:
  - source: owner request in the dsh session 2026-11-01 (implement our own computer-use)
  - source: owner correction and choices 2026-11-02 (computer use, native macOS app-scoped; 7 seats) - D-024, D-026
---

# [cu] Developer Three (macOS helper) - Responsibilities

## Owner statements, verbatim

> Please learn about how computer-use on ChatGPT works, and implement our own computer-use in this repository.

> No, it is not about browser-use, it is computer-use, please research and differentiate between them!

## What the seat owns

The helper app (Swift via `swiftc`, no Xcode, no npm): ScreenCaptureKit capture of approved apps, CGEvent input,
Accessibility reads, the listen-only event tap and HID idle guard for the local-input pause, LaunchServices launch,
the stable bundle identity and signing, `selftest`, and the server side of the helper protocol, with tests. Paths
as the M6 design names them ([desktop-extension](../../_designs_/desktop-extension/INDEX.md)).

## Current task, in order (M7, D-024, D-025)

1. Read the M6 design, cu-developer-two's measurements and review, and D-024/D-025. Take over the helper skeleton
   cu-developer-two started (it lands first, then the Swift code is yours; cu-developer-two keeps the Node driver).
2. Build the helper to the protocol: every primitive answers `not_granted` without prompting until the owner grants;
   a dry-run/offscreen path cu-verifier can drive before the grant; tests for each primitive.
3. Prepare the single owner TCC request with the coordinator: exact bundle id, signing identity (owner's choice),
   the three services, and the steps. Nothing raises a TCC prompt before that request.
4. After the grant, the fixture-app-only measurements M6 lists (capture rate, pid-targeted vs global input, the idle
   counter under synthetic input, AX hit-testing).

## Rules

Synthetic input only to the team's fixture apps until the local-input pause and exclusions are tested; one
announced desktop run at a time; never read the keychain; code pull requests are merged by cu-integrator.

## Linear duties (linear-workflow.md, D-055)

CUHelper issues: `queue`, `take`, at most two In Progress. Every helper PR names its issue; installs are announced on the issue and the inbox, never within 30 minutes of a booked step 4. PR title `Fixes CU-n` only when complete, `Part of CU-n` otherwise; `note` evidence; `release` with where you stopped. Workflow: [linear-workflow.md](../../_context_/team-operations/linear-workflow.md).

## Read next

[`INDEX.md`](INDEX.md); [working model](../../_context_/team-operations/working-model.md).
