---
title: computer-use
created: 2026-11-01T09:06:25Z
modified: 2026-11-08T10:20:00Z
version: 3.1.0
description: 'The computer-use repository - a computer-use agent for native macOS, its code, tests, verifiers and the [cu] team''s records, in one public knowledge bank.'
grounded_in:
  - source: owner request in the dsh session 2026-11-01 (learn how computer use on ChatGPT works and implement our own)
  - source: owner's order of 2026-11-08 (one public repository holding the code and the records, by the knowledge-bank conventions)
---

# computer-use

A computer-use agent for native macOS: it completes a task by looking at screenshots of approved apps and
driving mouse and keyboard through a signed helper app, with per-app approval, consent at the point of risk and
a person able to watch, pause, take over and stop - the behaviour of ChatGPT's computer use, built here. What
done means is [`ULTIMATE_GOAL.md`](ULTIMATE_GOAL.md). Start with [`AGENTS.md`](AGENTS.md) for the conventions.

| Path | What it is |
|---|---|
| [`ULTIMATE_GOAL.md`](ULTIMATE_GOAL.md) | what completes the project, one row per verifiable part |
| [`AGENTS.md`](AGENTS.md) | the conventions that bind here, public hygiene, and how a change is finished |
| [`README.md`](README.md) | what the project is, for a reader arriving cold |
| [`_guides_/`](_guides_/INDEX.md) | guides for people using it - start with the owner's desktop guide |
| [`_designs_/`](_designs_/INDEX.md) | the desktop and system designs the code follows |
| [`_environments_/`](_environments_/INDEX.md) | `macos-desktop` (driver and the Swift helper `CUHelper.app`), `chrome-browser` (version 1) |
| [`_tools_/`](_tools_/INDEX.md) | `agent-core` (loop, policy, consent, run CLI), `live-view`, `computer-use-mcp`, `desktop-fixture`, `verify-kit` |
| [`_tests_/`](_tests_/INDEX.md) | node and Swift unit tests |
| [`_verifiers_/`](_verifiers_/INDEX.md) | one verifier per ULTIMATE_GOAL row, each with mutants |
| [`_evaluators_/`](_evaluators_/INDEX.md) | the desktop task suite, its runner and results |
| [`_vendor_/browser-use/`](_vendor_/browser-use/INDEX.md) | the dependency-free Chrome DevTools client, copied unmodified with its provenance |
| [`_context_/`](_context_/INDEX.md) | research (ChatGPT computer use, desktop mechanics, model capabilities, evaluation design) and the team's operating records (decision log, working model, Linear workflow) |
| [`_team_members_/`](_team_members_/INDEX.md) | one record per seat: responsibilities, artifacts, handover |

Issues and milestones live in Linear (team CU); a pull request names its issue with `Fixes CU-n` or
`Part of CU-n`. The live roster (`TEAM.yaml`, with session ids) and the session-bearing operating logs stay in
the owner's private records. The history before 2026-11-08 is kept privately; this repository starts from a
scrubbed tree; its pull request numbers restart at #1 (see [`AGENTS.md`](AGENTS.md)).

## Read next

[`AGENTS.md`](AGENTS.md), then [`ULTIMATE_GOAL.md`](ULTIMATE_GOAL.md), then the
[working model](_context_/team-operations/working-model.md).
