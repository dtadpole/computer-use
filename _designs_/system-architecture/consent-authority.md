---
title: Consent authority
created: 2026-11-01T09:42:25Z
modified: 2026-11-05T16:23:12Z
level: L1
version: 0.8.3
description: Who may answer a consent request and who never can - the threat model that excludes the calling session's model, the human channels including DSH's approval gate, how a caller's pre-approval becomes effective, the residual risk and its check.
status: unverified
grounded_in:
  - source: cu-coordinator review of the 0.1 draft, inbox 20261101T093506 (B1, the calling model can grant its own consent)
  - source: _context_/model-capabilities/mcp-clients.md@1.0.0
  - source: _context_/model-capabilities/dsh-approval-modes.md (02b7ef944)
  - source: _context_/team-operations/decision-log.yaml (D-012, D-013)
---

# Consent authority

## Threat model

Consent is a person's decision (R26, R30, R61). These are **never** consent authorities, whatever they send: the
agent's model; the page and anything it renders; **the calling session's model**, which reads the run's summaries
and screenshots and is therefore downstream of the page; tool results; the trajectory. An answer arriving other
than through a human channel is refused by name (`consent_not_accepted_from_caller`) and recorded. Answers to the
model's questions and `guide` text are information, never consent.

## Human channels

| Channel | Why it is a person | Available |
|---|---|---|
| `tty` | typed at the CLI's own terminal | CLI runs |
| `live` | the watch page used with the control token ([run-tokens](run-tokens.md)) | every run |
| `dsh_gate` | DSH's approval panel: the person allows or rejects, the model only learns the outcome | optional, later (D-013); not an M1 to M3 channel |
| `api` | an in-process harness stands in for the person (D-012) | same-process callers only |

MCP elicitation is unavailable: DSH declares no such capability and heddle has no MCP client
([MCP clients](../../_context_/model-capabilities/mcp-clients.md)). **In M1 to M3 the channels are `tty` and `live`
(D-013)**; an MCP-started run reaches its person through `cli.mjs control-link`. If `dsh_gate` is built later, it is
a DSH plugin tool `computer_use_confirm { run_id, request_id }` whose `tools/pre-execute` always asks, gating one
request with lifetime `once`; the panel text comes from the run's own request, never the model's arguments. Under
`danger-full-access`, with approval prompts disabled, under the `auto` preset, under ACP, or whenever it cannot tell
the mode, it declines: it never resolves as allowed without a person's click. Per Q-R8 it calls
`ctx.approval.request` itself so it sees the outcome, takes no `command` argument, and treats ACP, subagent,
headless and SDK sessions as no-consent; the agent's own browser never shows a DSH tab.

With no human channel, every consent request declines at once and the run's status names the step that needed a
person. The `api` controller offers `pending()`, `respond({ id, approved, lifetime })`, `answerAsk`,
`waitForRequest(timeoutMs)`; every consent event records `answeredBy` (`tty`, `live`, `dsh_gate`, `api`,
`unattended`, `timeout`).

## Pre-approvals

CLI flags are human-typed and apply at start. An MCP caller's `pre_approve` is only a request: the first human
channel shows it as one item, "pre-approve exactly these", and it applies only after that exact list is confirmed.

## Residual risk and check

A calling session that runs shell commands as the same user can read local files, including the control-token
file, and start its own browser; no local secret survives that. The design keeps every consent path out of the MCP
tool interface; the rest relies on the calling harness's own command approvals.

The `consent-safety` seed in [goal-checks](goal-checks.md) has a scripted MCP caller send `respond` with
`approved: true`, `consent` with the view token, and an unconfirmed `pre_approve` for the checkout: each is refused,
the checkout still pauses, and the state endpoint shows no order.
