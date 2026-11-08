---
title: Run tokens and who may send what
created: 2026-11-01T09:50:29Z
modified: 2026-11-05T16:23:12Z
level: L1
version: 0.6.1
description: The view and control tokens of a run, where each may travel, how the control token reaches a person, and which sender may issue which live-control command.
status: unverified
grounded_in:
  - source: cu-coordinator review of the 0.1 draft, inbox 20261101T093506 (B1)
  - source: _context_/team-operations/decision-log.yaml (D-012)
---

# Run tokens and who may send what

Each run has two 128-bit random tokens, compared in constant time. Why a calling model never holds the second is
[consent-authority](consent-authority.md).

| Token | May | May travel to |
|---|---|---|
| view | watch the screen, events and replay; send `pause` and `stop`, which only reduce what the agent does | a caller, a tool result, the CLI output |
| control | every command, including `consent`, `take_over`, `hand_back`, `guide` and `resume` after a pause made with it | a person only: the CLI's own terminal, `$CU_HOME/control/<run-id>` (mode 600, removed at run end), an in-process harness, and a DSH consent plugin only if D-013's later channel is built |

The control token never appears in a tool result, event, log, trajectory record or inbox message. For a run started
over MCP, a person who wants the live view runs `cli.mjs control-link <run-id>` in a terminal.

## Who may send what

| Sender | Commands |
|---|---|
| view token | `pause`, `stop` |
| M4 caller (`computer_use_control`) | `pause`, `resume` of its own pause, `stop`, `guide` |
| control token, in-process `api` | every command |
| DSH consent plugin (later, D-013) | `consent` for one request, lifetime `once`, after the person allows it |

A pause made with the control token resumes only with it. A command its sender may not issue is refused with the
reason and recorded as a `control` event with its source (`view`, `control`, `caller`, `api`, `dsh_plugin`), never
with a token.
