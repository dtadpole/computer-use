---
title: computer-use tools
created: 2026-11-01T09:33:46Z
modified: 2026-11-09T23:30:00Z
version: 1.9.0
description: The computer-use project's _tools_ type folder - libraries and scripts, one instance per tool.
grounded_in:
  - source: _context_/team-operations/working-model.md@1.0.0
---

# `_tools_`

Shared by the [cu] seats; each row names its owner. Add your row, keep the others.

| Instance | What it is | Owner |
|---|---|---|
| [`agent-core/`](agent-core/INDEX.md) | the agent core: keys, site filter, launch gate, run control; loop and adapters to follow | cu-developer-one |
| [`fixture-site/`](fixture-site/INDEX.md) | the loopback lab with machine-checkable task outcomes | cu-verifier |
| [`desktop-fixture/`](desktop-fixture/INDEX.md) | CU Fixture, the native macOS fixture app for desktop tasks and injection screens | cu-verifier |
| [`verify-kit/`](verify-kit/INDEX.md) | starting check browsers (D-014 registry, memory gate), a reference CDP input executor, the oracle plan runner | cu-verifier |
| [`live-view/`](live-view/INDEX.md) | one run's watch and control page on 127.0.0.1 | cu-developer-two |
| [`computer-use-mcp/`](computer-use-mcp/INDEX.md) | the MCP stdio server DSH and heddle sessions call | cu-developer-two |
| [`heddle-plugin/`](heddle-plugin/INDEX.md) | the heddle plugin that brings computer use into a heddle session | cu-developer-two |
| [`desktop-checks/`](desktop-checks/INDEX.md) | reviewed live checks of the desktop driver that act on the owner's session (the CU-64 G1 held-keys check) | cu-developer-two |
| [`nightly-regression/`](nightly-regression/INDEX.md) | the no-model nightly regression on main: suites, verifiers, fixture plans and dry run under the lock; flake list and report (CU-59) | cu-integrator |
| [`probe-kit/`](probe-kit/INDEX.md) | CU-384 (D-100): driver- and loop-shaped targets and contexts plus the real deciding components for consent policy probes; a drift test follows the drivers | cu-researcher |
| [`push-gate/`](push-gate/INDEX.md) | CU-337 (D-097): the pre-push hook that refuses a push on the public-hygiene gate's exit status | cu-developer-two |

## Read next

[`../INDEX.md`](../INDEX.md).
