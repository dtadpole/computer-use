---
title: Open questions and review status
created: 2026-11-01T09:24:10Z
modified: 2026-11-09T13:47:48Z
level: L1
version: 0.8.4
description: The questions this draft still needs answered before approval, the defaults it assumes until then, what each review changed, and the review state per seat.
status: unverified
grounded_in:
  - source: _seats_/cu-developer-one/responsibilities.md@1.0.0
  - source: inbox answers of 2026-11-01 from cu-researcher (20261101T092843, 20261101T093356, 20261101T094654, 20261101T094804, 20261101T095252), cu-developer-two (20261101T093051, 20261101T094243, 20261101T094800), cu-verifier (20261101T094142) and cu-coordinator (20261101T093506, 20261101T093534, 20261101T094218, 20261101T094813, 20261101T095146, 20261101T095414; D-013, D-014), cu-verifier sign-off (20261101T100312), cu-researcher Q-R8 (20261101T100417)
  - source: _seats_/cu-verifier/m1-testability-review.md (ffe8dcd51)
---

# Open questions and review status

Each open question has a default the draft assumes; an answer confirms it or changes the named article.

## What the reviews changed

| Review | Changed |
|---|---|
| cu-researcher: the gateway takes `computer_toolset_20260801` only; no gateway model sees images ([model-capabilities](../../_context_/model-capabilities/INDEX.md)) | [anthropic-mapping](anthropic-mapping.md), [model-adapters](model-adapters.md) |
| cu-developer-two: interface proposal, eight decisions, Q-D1 to Q-D5 measured | [environment-driver](environment-driver.md), [environment-behaviour](environment-behaviour.md), [keys-and-coordinates](keys-and-coordinates.md) |
| cu-verifier: V-B1 to V-B6, Q-V2 to Q-V4 (D-012); Q-V1 answered no, fixed by V-B4 | [goal-checks](goal-checks.md), [layout](layout-and-ownership.md), [trajectory](trajectory.md), [model-adapters](model-adapters.md), [consent-authority](consent-authority.md) |
| cu-coordinator: B1 self-consent, B2 loopback and private ranges, Q-C1 | [consent-authority](consent-authority.md), [site-filter](site-filter.md) |
| cu-researcher: no MCP elicitation ([MCP clients](../../_context_/model-capabilities/mcp-clients.md)); R54 to R62; Q-R5 `configs` disables members; Q-R7 the gateway ignores `context_management`; Q-R8 DSH modes ([approval modes](../../_context_/model-capabilities/dsh-approval-modes.md)) | [consent-authority](consent-authority.md), [run-tokens](run-tokens.md), [anthropic-mapping](anthropic-mapping.md), [traceability](traceability.md) |
| cu-coordinator: D-013 (`tty` and `live` in M1 to M3, `dsh_gate` optional later, heddle path at M4), D-014 (browser registry) | [consent-authority](consent-authority.md), [integration-surface](integration-surface.md), [environment-behaviour](environment-behaviour.md) |
| cu-developer-two sign-off notes: secrets before `perform`, `hiddenText`, registry, `fitScale` limits | [untrusted-content](untrusted-content.md), [environment-driver](environment-driver.md) |
| cu-researcher trace of R1 to R62 and the coordinator's rulings (20261101T095414): no MUST missing; R34 (`page_dialog`), R39 (no capture during take-over), R31 (`thread` deferred), R49 (fresh state) closed, plus five smaller items | [action-policy](action-policy.md), [live-control](live-control.md), [consent-gate](consent-gate.md), [goal-checks](goal-checks.md), [site-filter](site-filter.md), [run-outcomes](run-outcomes.md) |

## Still open

| ID | To | Question | Default |
|---|---|---|---|
| Q-C3 | cu-coordinator | heddle's path to the tool at M4: an MCP client or native tool from the [hd] team | integration row met for DSH only until then (D-013) |
| Q-O1 | owner, via the setup session | A direct OpenAI key and budget for a live `responses` run? | recorded fixtures only |

## Review status

| Seat | State |
|---|---|
| cu-developer-two | **signed off** the driver interface of 0.4 (b623a9e68); its three notes folded into 0.6 |
| cu-researcher | **trace reviewed** (20261101T095252): no MUST missing; the four partials closed per the coordinator's rulings in 0.8 |
| cu-verifier | **signed off** testability on 0.8 (20261101T100312), holding for 0.8.1 |
| cu-coordinator | **approved** M1 at 687f4336b, design 0.8.1 (D-015, 20261101T100437); 0.8.2 adds only the Q-R8 notes for the optional later `dsh_gate` |
