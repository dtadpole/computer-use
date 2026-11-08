---
title: computer-use
created: 2026-11-05T14:50:00Z
modified: 2026-11-08T10:00:00Z
level: L2
version: 2.0.0
description: What the computer-use repository is, for a reader arriving cold - a computer-use agent for native macOS and the team's records.
status: unverified
grounded_in:
  - source: INDEX.md and AGENTS.md of this repository
---

# computer-use

A computer-use agent for native macOS: it completes a task by looking at screenshots of approved apps and
driving mouse and keyboard through a signed helper app (Screen Recording and Accessibility), with per-app
approval, hard exclusions, consent at the point of risk, and a person able to watch, pause, take over and stop.
Built by the [cu] team. Since 2026-11-08 this one public repository holds the code and the team's records; it
starts from a scrubbed tree, and the earlier history is kept privately.

| Path | What it is |
|---|---|
| `_guides_/` | guides for people using it - start with the [owner's desktop guide](_guides_/desktop-user-guide/INDEX.md) |
| `_designs_/` | the desktop and system designs the code follows |
| `_environments_/` | `macos-desktop` (driver and the Swift helper `CUHelper.app`), `chrome-browser` (version 1) |
| `_tools_/` | `agent-core` (loop, policy, consent, run CLI), `live-view`, `computer-use-mcp`, `desktop-fixture`, `verify-kit` |
| `_tests_/` | node and Swift unit tests |
| `_verifiers_/` | one verifier per ULTIMATE_GOAL row, each with mutants |
| `_evaluators_/` | the desktop task suite and its runner |
| `_vendor_/` | `browser-use`, the dependency-free Chrome DevTools client, copied unmodified with its provenance (CU-1) |
| `_context_/` | research (ChatGPT computer use, desktop mechanics, model capabilities, evaluation design) and the team's operating records |
| `_team_members_/` | one record per seat |
| `ULTIMATE_GOAL.md` | what completes the project, one row per verifiable part |

## Working here

- Read [`AGENTS.md`](AGENTS.md) first: the conventions, public hygiene and how a change is finished.
- Issues and milestones: Linear, team CU. A pull request names its issue with `Fixes CU-n` or `Part of CU-n`.
- `main` is PR-only and protected; cu-integrator lands reviewed, gated SHAs.
- Private model aliases and machine paths live in `~/.config/computer-use/config.json`
  ([`local-config.mjs`](_tools_/agent-core/local-config.mjs)); the live roster and session logs stay private.
