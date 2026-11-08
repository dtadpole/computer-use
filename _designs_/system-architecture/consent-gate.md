---
title: Consent gate
created: 2026-11-01T09:24:10Z
modified: 2026-11-05T16:23:12Z
level: L1
version: 0.8.1
description: How a confirm decision or a safety check becomes a human decision at the point of risk - the request, the exact-true answer, approval scopes and lifetimes, the recheck at execution and the controllers that answer.
status: unverified
grounded_in:
  - source: _context_/chatgpt-computer-use/safety-confirmation-policy.md@1.0.0
  - source: _context_/chatgpt-computer-use/api-sdk-computer-toolset.md@1.0.0
  - source: _context_/chatgpt-computer-use/safety-isolation-and-approvals.md@1.0.0
---

# Consent gate

The gate asks at the point of risk, never early: safe actions before it in the batch have already run, and the
loop is stopped before the risky one.

## Request and answer

```
request  { id, runId, step, kind: "action" | "safety_check", class, rule, action, target,
           what, recipient, why, screenshot, lifetimes: ["once", "batch", "run"] }
answer   { id, approved, lifetime }
```

`what`, `recipient` and `why` are filled from the action, target and origin, so a person reads "type 16 characters
into Card number on shop.example, for the checkout the task asked for" rather than a raw action (R28). Several
imminent actions of one batch may be grouped into one request only when every one is fully known.

- Only `approved === true` approves; anything else, a missing answer or the timeout is a decline (R30).
- A decline stops the batch: the action and the rest are `declined` and `skipped`, and the model is told what ran
  and what did not, then the loop continues.
- A declined safety check ends the run `declined`, as the SDK does (R21).

## Scope and lifetime (R31)

An approval binds to `{ class, origin, fingerprint }`, where `fingerprint` is the target's from `inspectPoint` or
`focusedElement`.

| Lifetime | Covers |
|---|---|
| `once` | this action |
| `batch` | the same class and origin for the rest of this model turn (R31's turn) |
| `run` | the same class and origin until the run ends |
| `always` | persisted in `$CU_HOME/approvals.json`; off unless the configuration enables it, never for `purchase` or `delete` |

## Recheck at execution

Approval covers fixed arguments, not the screen. Just before executing, the loop re-reads the target; a different
origin or fingerprint voids the approval and asks again (R30).

## Controllers

A controller implements `requestConsent(request)` and `answerAsk(question)`, returning promises. Only human
channels (`tty`, `live` with the control token, in-process `api` for tests, and later perhaps `dsh_gate`) may answer
`requestConsent`; `unattended` declines every request and answers no question. Why the calling session's model is
never one of them is [consent-authority](consent-authority.md).

The gate never consults the model, the page, the caller or the trajectory to decide. Every request, answer and
refused answer is recorded.
