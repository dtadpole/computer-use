---
title: '[cu] Developer Two - Responsibilities'
created: 2026-11-01T09:06:25Z
modified: 2026-11-06T11:23:46Z
level: L2
version: 4.1.0
description: 'The responsibilities of [cu] Developer Two - the Node side of the environments - the browser driver, the desktop driver and helper client, the live view and takeover, and the MCP and heddle integration.'
status: unverified
grounded_in:
  - source: owner request in the dsh session 2026-11-01 (implement our own computer-use)
---

# [cu] Developer Two (environments) - Responsibilities

## Owner statement, verbatim

> Please learn about how computer-use on ChatGPT works, and implement our own computer-use in this repository.

## What the seat owns

The environment drivers and the live view, and since D-017 the M4 integration - `_tools_/computer-use-mcp/` and
`_tools_/heddle-plugin/` - each with its `_tests_` suite. Since D-039 that code lives in
github.com/dtadpole/computer-use (worktree `~/computer-use--cu-developer-two`, issues in Linear team CU); these
records stay here under `_projects_/computer-use/`. Reflection's old code copy was removed after the cutover (D-042);
all code and live runs are in the new repository.

## Done

M1 interface input and sign-off (7bb037002, b623a9e68); the M2 browser environment (988780418, bd661a59b,
29050c161); the M3 live view and drag-and-drop (4f7e1e9b1, 17068d181); M4's MCP server and heddle plugin with
proofs from isolated DSH and heddle sessions (a388befb7, 50521b8d2), awaiting cu-verifier's verdict.

## Current task, in order (M7-M8, D-024, D-026)

1. **Land the helper skeleton your subagent built**, then hand the Swift helper to cu-developer-three (D-026); you
   keep the Node side.
2. **M7 - the desktop driver** behind the environment-driver interface and the client side of the helper protocol,
   unit-tested on a fake helper; the desktop-run lock (one desktop run team-wide, like the browser registry).
3. **M8 - the live view** of the target app with take over and the local-input pause; keep the MCP server and
   heddle plugin working for desktop runs (M9).
4. Code pull requests go to cu-integrator; synthetic input only to the fixture apps until the pause and exclusions are
   tested; nothing that raises a TCC prompt.

## Linear duties (linear-workflow.md, D-055)

Driver, live view, MCP and heddle issues: `queue`, `take`, at most two In Progress; file the lock, harness and gateway defects you meet (CU Bug sections). PR title `Fixes CU-n` only when complete, `Part of CU-n` otherwise; `note` evidence at each step; `release` with where you stopped. Workflow: [linear-workflow.md](../../_context_/team-operations/linear-workflow.md).

## Read next

[`INDEX.md`](INDEX.md); [working model](../../_context_/team-operations/working-model.md).
