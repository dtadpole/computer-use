---
title: Human-only consent channels in the DSH and heddle MCP clients
created: 2026-11-01T09:50:00Z
modified: 2026-11-01T09:50:00Z
level: L1
version: 1.0.0
description: Whether the DSH and heddle clients support MCP elicitation, and which channel can carry a consent decision that the calling model can neither see nor answer (Q-R5).
status: unverified
grounded_in:
  - source: 'DSH 0.2.1-rc.2 installed package under ~/.volta/tools/image/packages/@deepseek-ai/dsh/lib/node_modules/@deepseek-ai/dsh, source read 2026-11-01 (no code run)'
  - source: 'heddle checkout ~/heddle at commit 8dbdcf831, source read 2026-11-01'
---

# Human-only consent channels in the MCP clients

Question Q-R5 from the coordinator: can our MCP server ask the person, not the calling model, to approve a
consequential action? Read from source only. `$D` is the DSH package root named in the frontmatter.

## Verdict

| Client | Elicitation | Evidence |
|---|---|---|
| DSH 0.2.1-rc.2, `@modelcontextprotocol/client` 2.2.0 | **No.** The client declares `capabilities: {}`; no handler for server requests exists and the web GUI has no elicitation form | `$D/node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js:596-601` |
| heddle at 8dbdcf83 | **No MCP client at all** (no `mcp`, `modelcontextprotocol` or `jsonrpc` in `src/` or `rust/`) | `package.json:50-58` has no MCP SDK |

A server that sends `elicitation/create` to DSH gets JSON-RPC -32601 under protocol 2025-11-25, and silence under
2026-07-28, where an input-required tool result fails the call (client `dist/src-xKF0PJN-.mjs:5933-5936`,
`dist/index.mjs:3153-3155`, `src-xKF0PJN-.mjs:6477-6478`). DSH times MCP tool calls out after 60 s by default and
drops tool annotations such as `destructiveHint` (`dsh-mcp-client/lib/index.js:765`, `:133-147`).

## The channel that exists: DSH's approval gate

- An in-process plugin's `tools/pre-execute` handler can return `{kind:"ask"}` for any call, including
  `mcp__<server>__<tool>` (`dsh-tools/lib/index.js:3321-3322`, request at `:3551`).
- The person answers in the web GUI's approval panel: Enter allows once, Esc rejects
  (`dsh-client-ui-approval/lib/client.js:322-357`). The model receives only a denial reason (`dsh-tools:3564-3584`).
- It fails closed: policy `never` rejects, no answerer yields `unavailable`, headless runs have no answerer; there is
  no timeout (`dsh-user-approval/lib/index.js:175-188`).
- It is not human-only under ACP, where the ACP client answers (`dsh-acp/lib/index.js:1158-1180`), or under the
  experimental `auto` preset, where an LLM reviews first (`dsh-experimental-auto-review/lib/index.js:461-483`).
- `ask_user_question` is not a consent channel: the model asks and reads the answer, so it could relay a forged
  consent.

heddle has an approval card (`src/server/web.ts:227-232`, `page.html:2755-2761`), but only sandbox escalation uses
it (`src/tools/service.ts:217-239`); per-tool `ask` mode denies without asking (`src/approvals/service.ts:135-141`).

## Consequences (inference)

- Each consequential computer action is its own MCP tool call, gated by a small DSH plugin that asks the person;
  the gate runs before the call, so the server cannot ask mid-call.
- heddle needs an MCP client or a native tool, plus a real per-tool ask, before it can host consent.
- Approval endpoints sit behind a local token and cookie; keep the model's shell away from those credential files.
