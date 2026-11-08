---
title: Integration surface for DSH and heddle sessions
created: 2026-11-01T09:24:10Z
modified: 2026-11-05T16:23:12Z
level: L1
version: 0.6.1
description: The M4 tool a DSH or heddle session calls - an MCP stdio server with start, status, respond and control tools that never block past the two-minute rule and carry no consent path - and the result it returns.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@1.0.0
  - source: shared/_conventions_/core-conventions/bounded-waits.md@1.0.1
---

# Integration surface (M4)

A session reaches computer use through an MCP server over stdio, `_tools_/computer-use-mcp/server.mjs`, built on
`agent-core/lib.mjs`. MCP is chosen because DSH and heddle sessions both load MCP servers by configuration, so one
server serves both; a native tool can wrap the same library later. Runs execute inside the server process; no call
blocks longer than 50 seconds, under DSH's 60-second MCP timeout and the two-minute rule.

| Tool | Input | Returns |
|---|---|---|
| `computer_use_start` | `task`, `start_url`, `allow_sites`, `model` (such as `claude-gateway/claude-sonnet-5-5` or a local-config alias such as `claude-gateway/model-a`, or `scripted` with a plan file for checks; default: the local config's `defaultModel`, else `claude-gateway/claude-opus-5`), `max_steps`, `max_minutes`, `max_cost_usd`, `pre_approve` (a request a person must confirm), `secrets` (references), `live_view` (default true) | `run_id`, `view_url` (view token only), `state` |
| `computer_use_status` | `run_id`, `wait_seconds` (0 to 50) | `state`, step count, last summary, a pending question, "waiting for a person" with the step and class of a pending consent, and the result when finished |
| `computer_use_respond` | `run_id`, `question_id`, `answer` text | the new state; `approved` or `lifetime` is refused by name |
| `computer_use_control` | `run_id`, `command` (`pause`, `resume` of its own pause, `stop`, `guide`), `text` | the new state; `take_over`, `hand_back` and `consent` need the control token, which this tool never holds |

`status` returns early on any state change, so a session polls cheaply. **The tool interface carries no consent
path**: consent comes only from a human channel, in M1 to M3 the live view with the control token, reached by a
person through `cli.mjs control-link` (D-013, [consent-authority](consent-authority.md)). Without one, consent requests decline and `status` says
which step needs a person. DSH times MCP calls out at 60 s, so `wait_seconds` stays at most 50.

## Result

When finished, `status` returns the [run result](run-outcomes.md) as JSON text plus the final screenshot as an MCP
image content block, and the trajectory link (run directory and replay URL), as ULTIMATE_GOAL's integration row
requires.

## Limits

- heddle sessions cannot load an MCP server: heddle has no MCP client. At M4 the coordinator asks the [hd] team,
  who own heddle's code, for an MCP client or a native tool wrapping `lib.mjs`; until then the integration row is met
  for DSH only (D-013).
- One run at a time per server in 0.6, and the Chrome memory gate applies (D-005).
- `start_url` and `allow_sites` pass the same site filter as everything else; the fixed deny list protects DSH and
  heddle from the agent they launched.
- A session's own tool approvals do not replace the consent gate: approving the `computer_use_start` call
  approves starting, not purchases inside the run.
