---
title: Untrusted content and escalation
created: 2026-11-01T09:24:10Z
modified: 2026-11-05T16:23:12Z
level: L1
version: 0.6.1
description: The layered defence against instructions found on screen - the system instructions, the escalate tool, a model-independent inspector, provider safety checks, secret placeholders and the site filter - and what stop and escalate means.
status: unverified
grounded_in:
  - source: _context_/chatgpt-computer-use/safety-confirmation-policy.md@1.0.0
  - source: _context_/chatgpt-computer-use/safety-data-and-audit.md@1.0.0
  - source: _context_/chatgpt-computer-use/implications-safety-and-control.md@1.0.0
---

# Untrusted content and escalation

Only the caller's task grants intent; pages, PDFs, e-mails, dialogs and tool output are data, however urgent they
sound (R26). An instruction found on screen stops the run and escalates; it is never followed (R34). No single
layer is trusted to catch it.

| Layer | Mechanism | Model-independent |
|---|---|---|
| Instructions | the run's system text states the rule and tells the model to call `escalate` when the screen asks for anything the task did not | no |
| `escalate` tool | `{ reason: "suspected_injection" \| "phishing" \| "unexpected_request" \| "needs_user", evidence }`; ends the turn | no |
| Inspector | after each batch, `agent-core/inspect.mjs` scans `pageText` and `hiddenText` for text addressed to an agent (ignore previous instructions, you are now, assistant, system prompt), credential requests off the allowed origins, and fake system dialogs | yes |
| Provider checks | `pending_safety_checks` from the `responses` adapter | no |
| Data flow | `sensitive_data` and `credential` classes confirm before typing ([policy](action-policy.md)) | yes |
| [Site filter](site-filter.md) | one canonical URL decision at the action and network layers | yes |

## Stop and escalate

An `escalate` call or an inspector hit becomes a consent request of kind `safety_check` with the evidence and the
screenshot. Unattended, the run ends `escalated`. Attended, the person may continue (explicit `true`, lifetime
`once`) or stop; continuing tells the model the person reviewed the content and that the page still grants no
intent. Inspector false positives are expected; their rate is recorded by the injection suite rather than tuned
away by hiding hits.

## Secrets outside model context (R33)

The caller may pass named secrets by reference to a file or environment variable, never by value in the task. The
model types the placeholder `{{secret:name}}`; the loop treats it as class `credential`, confirms, and substitutes
the value just before calling `environment.perform`, so the driver stays secret-agnostic and `ActionEffect` never
carries typed text. Model input, results and the trajectory hold the placeholder;
screenshots of a filled password field show only masked characters.

## What this does not claim

Pixel-only injections (text drawn in images) are seen by the model alone; the inspector reads DOM text, so those
pages are judged on live models only. Offline, a scripted plan that obeys an injection must still never get its
side effect to the fixture, which tests the model-independent layers; benign tasks must show zero inspector hits,
so a build that escalates on everything fails.
