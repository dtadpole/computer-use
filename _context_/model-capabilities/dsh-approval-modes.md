---
title: Which DSH approval modes reach a person
created: 2026-11-01T10:05:00Z
modified: 2026-11-01T10:05:00Z
level: L1
version: 1.0.0
description: For each DSH permission mode, whether an approval ask reaches a person or resolves without one, what a plugin can learn about the answer, and what text the panel shows (Q-R8).
status: unverified
grounded_in:
  - source: 'DSH 0.2.1-rc.2 installed package under ~/.volta/tools/image/packages/@deepseek-ai/dsh/lib/node_modules/@deepseek-ai/dsh, source read 2026-11-01 (no code run)'
---

# Which DSH approval modes reach a person

Question Q-R8, for the design's `dsh_gate` consent plugin ([MCP clients](mcp-clients.md)). Paths are relative to
`$D/node_modules/@deepseek-ai/`; read from source, nothing run.

## Verdict per mode

| Mode | An ask resolves to | Person sees a panel | Evidence |
|---|---|---|---|
| Default web GUI (workspace-write, policy `ask`) | the person's answer; no timeout | yes: Reject or Allow once, Enter allows | `dsh-base/cordis.patch.yml:262`; `dsh-client-ui-approval/lib/client.js:70-79`; `dsh-user-approval/lib/index.js:177-188` |
| `danger-full-access` (policy `never`) | `rejected` before any answerer | no | `cordis.patch.yml:262, 274-276`; `dsh-user-approval/lib/index.js:175` |
| Approval prompts disabled (`policy: "never"`) | `rejected`; subagents are always pinned to `never` | no | `dsh-user-approval/lib/index.js:37, 74`; `dsh-subagent/lib/index.js:404, 413` |
| `auto` preset (LLM review first) | the reviewer never turns an ask into an allow; the ask still reaches the person | yes | `dsh-experimental-auto-review/lib/index.js:461-483` |
| ACP | the ACP client answers allow_once or reject_once, seeing only the tool-call id | not ours | `dsh-acp/lib/index.js:1158-1180` |
| Headless, SDK, no answerer | `unavailable`, then deny | no | `dsh-tools/lib/index.js:3537-3542, 3578-3581` |

**ACP is the only mode where an ask can be allowed without a person clicking.** DSH has no allow-lists, no
remembered rules and no "always allow": the only grant is `allowed-once`. Under `never` the model is told
`the user rejected tool ...` although no person decided (`dsh-tools/lib/index.js:3564-3567`).

## What a plugin can learn

- The outcome is one of `allowed-once`, `rejected`, `cancelled`, `unavailable`, with no field saying who answered;
  the audit log keeps `{id, outcome}` (`dsh-user-approval/lib/index.js:30-35, 132-142`).
- A handler that returns `{kind:"ask"}` never sees the outcome. It can read the mode through
  `ctx.approval.effectivePolicy(session)` and `ctx.permissionPresets.current(session)`, but not whether ACP owns the
  session (`dsh-acp/lib/index.js:1116-1121`).
- Any connected browser peer, or any in-process plugin, may answer `allowed-once`; DSH checks only the value
  (`dsh-api-remotes/lib/index.js:233-249`).

## What the panel shows

The plugin's own `reason` and localized `displayReason` form the headline (`client.js:43, 109-111`). The model's
arguments appear only as a string `command` argument (`dsh-client-ui-chat/lib/client.js:151-171`).

## Consequences (inference)

- Every [cu] seat and many owner sessions run `danger-full-access`, where `dsh_gate` can only decline; the live view
  with the control token remains the working consent channel there (R61).
- `dsh_gate` should call `ctx.approval.request(...)` itself (`dsh-user-approval/lib/index.js:128-144`) to see the
  outcome, refuse clearly under `never`, and treat ACP, subagent, headless and SDK runs as no-consent; ACP needs a
  deployment flag because code cannot detect it.
- `computer_use_confirm` should have no `command` parameter, so no model-written text reaches the panel.
- Our own agent could press Enter on a DSH tab it can see; keep the DSH window out of the agent's environment.
