---
title: ULTIMATE_GOAL verdict, row by row
created: 2026-11-01T19:05:12Z
modified: 2026-11-01T19:05:12Z
level: L1
version: 1.0.0
description: cu-verifier's independent per-row verdict on the computer-use ULTIMATE_GOAL - every row holds on build 842b12c06 or later, each judged by its own verifier from outside evidence and proven to fail on broken builds, with what stays open.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@1.0.0
  - source: _verifiers_/INDEX.md@2.0.0
---

# ULTIMATE_GOAL verdict: every row holds

Each verifier judges from the fixture, recorder, process table, PNG bytes and files only (D-012). Each one fails on
deliberately broken builds: 29 mutants caught, plus two broken record sets.

| Row | Verifier | Result | Fails on |
|---|---|---|---|
| environment | [browser-environment](../../_verifiers_/browser-environment/INDEX.md) | 5 of 5 | 4 mutants |
| perception | [perception-mapping](../../_verifiers_/perception-mapping/INDEX.md) | 2 of 2, scale 1 and 0.75, within 1 CSS px | 3 mutants |
| action contract | [action-contract](../../_verifiers_/action-contract/INDEX.md) | 13 of 13 | 4 mutants |
| agent loop | [agent-loop](../../_verifiers_/agent-loop/INDEX.md) | 7 of 7: steps, cost, time, cancel; Claude, Responses and scripted adapters | 5 mutants |
| consent and safety | [consent-safety](../../_verifiers_/consent-safety/INDEX.md) | 6 of 6; on the full suite, 14 of 14 injection pages escalated, 0 compromised, per model | 3 mutants |
| human control | [human-control](../../_verifiers_/human-control/INDEX.md) | 5 of 5 | 4 mutants |
| integration | [session-integration](../../_verifiers_/session-integration/INDEX.md) | 4 of 4; my own DSH and heddle sessions each read a random code off the returned screenshot | 3 mutants |
| trajectory | [trajectory-replay](../../_verifiers_/trajectory-replay/INDEX.md) | 3 of 3 | 3 mutants |
| evaluation | [evaluation-suite](../../_verifiers_/evaluation-suite/INDEX.md) | 35 tasks, 14 injection pages; Opus 28 of 35, Sonnet 29 of 35 on clean build 273400b0c | 2 record sets |

Milestones: M2 accepted (D-018); M3 and M4 accepted (D-022, [verdict](m3-m4-verdict.md)).

**Open, none blocking:**
- The desktop environment waits for the owner's approval, as the row requires.
- The Responses adapter is judged on OpenAI's documented wire shapes; no OpenAI endpoint is available here.
- The live page's buttons in a second browser need both team slots; the HTTP surface they use is verified.
- Re-runs of sign-in and new-tab-terms at 41580559f.

## Read next

[`artifacts.md`](artifacts.md).
