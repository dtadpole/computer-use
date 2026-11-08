---
title: Agents API hosted computer use
created: 2026-11-01T09:17:00Z
modified: 2026-11-01T09:35:50Z
level: L1
version: 1.1.0
description: The beta Agents API path where OpenAI hosts the browser, including session setup, origin and sign-in approvals, recovery and limits, turn cancellation, activity items and history gaps
status: unverified
grounded_in:
  - source: developers.openai.com/api/docs/guides/agents-api/tools/computer-use (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/agents-api/sessions (fetched 2026-11-01)
---

# Agents API hosted computer use

OpenAI hosts the browser; the application creates a session, streams events, answers approvals, verifies the
result and deletes the session [agt]. Requests carry header `OpenAI-Beta: agents=v1` against
`/v1/agents/sessions`, plus `/{id}/events` (input, stream) and `/{id}/items` (history) [agt].

## Session creation

```json
{ "agent": { "model": "gpt-6-astra",
    "tools": [{ "type": "computer_use", "include_screenshots": true }] },
  "environment": { "type": "openai_hosted",
    "desktop": { "enabled": true }, "network": { "access": "enabled" } } }
```

`agent.instructions` is omitted above; the task follows as an `agent.session.input.message` event [agt]. Network
access approves no origin, and origin approval does not override network policy [agt].

## Approvals

On `agent.session.requires_action`, retrieve the session and read `required_actions` entries of type
`computer_use_approval_request`; answer with event `agent.session.input.computer_use_approval_request_result`
and the same `request_id` [agt].

| `request.type` [agt] | Request fields | Response `response` |
|---|---|---|
| `browser_origin_access` | `origin`, `reason` | `{ type, decision }`, decision `approve`, `deny`, `cancel` |
| `browser_authentication` | `reason`, `credential_origin`, `fields` (`id`, `label`, `type`, `required`), `options` (`id`, `label`, `field_ids`) | `{ type, action: "submit", fields: [{ field_id, value }], selected_option }` or `action: "cancel"` |

Every new origin, public ones included, needs approval; HTTP 202 means accepted, not completed. Credentials stay
outside model input and history; disable automatic retries for them. Only the main agent can request sign-in;
passkeys and QR sign-in are unsupported [agt].

## Recovery and limits

| Case | Documented behaviour [agt] |
|---|---|
| Disconnect, failed response | Retrieve the session; rebuild forms only from current `required_actions`; never auto-resend task or approval |
| `400`, `404`, `409` | Fix payload; recheck IDs; refresh (expired, turn ended or already answered) |
| Lost before acknowledgement | "Treat acceptance as unknown"; retrieve before retrying |
| Sign-in request | Expires after five minutes; identical retry does not refill; changed values return `409` |
| Origin request | Pending until its turn ends; changing an accepted decision returns `409` |
| Sign-in submission | Up to six fields, 16,384 characters each, 120 KiB total |
| Any request | Up to 4 MiB [sessions] |

No rate limits are documented in these guides.

## Lifecycle

Closing the stream or cancelling a request does not stop the task; `agent.session.input.cancel` cancels the turn
and keeps the session [agt], [sessions]. Reuse a session for follow-ups; cookies expire and environment recycling
clears browser state; `DELETE /v1/agents/sessions/{id}` requests cleanup [agt].

## Activity, screenshots and history

Browser operations appear as `computer_use_call` items with `id`, `turn_id`, nullable `title`, `status`
(`in_progress`, `completed`, `failed`, `incomplete`) and `output`. Unless `include_screenshots` is true,
screenshots stay out of output, though the agent sees them; a completed item's `output` holds its last
`computer_screenshot` as a JPEG data URL, or null. History can omit image bytes, so capture them from
`agent.session.turn.item.done` [agt]. Sign-in requests and value-free responses are history items, but "Origin
approvals have no dedicated request or response history items" [agt]. **Inference:** log origin decisions
yourself. No live view or take-over is documented in [agt].

## Limitation that matters

Origin approval enforces no per-action confirmation; guaranteeing it for purchases or destructive changes needs
restricted resources or a developer-run browser, since a confirmation function tool relies on the agent calling
it [agt].

[agt]: https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use
[sessions]: https://developers.openai.com/api/docs/guides/agents-api/sessions
