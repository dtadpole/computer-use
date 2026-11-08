---
title: Requirements for our computer use, observability and evaluation
created: 2026-11-01T09:19:00Z
modified: 2026-11-01T09:37:50Z
level: L1
version: 1.1.0
description: Requirements R43 to R53, R58 and R59 for trajectory recording, diagnostics and outcome-based evaluation of a self-built computer-use system
status: unverified
grounded_in:
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers (fetched 2026-11-01)
  - source: github.com/openai/openai-cua-sample-app README (fetched 2026-11-01)
  - source: cdn.openai.com/operator_system_card.pdf (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/agents-api/tools/computer-use (fetched 2026-11-01)
---

# Requirements, observability and evaluation

Levels as defined in [environment and perception](implications-environment-and-perception.md).

## Observability and trajectory

| ID | Level | Requirement | From |
|---|---|---|---|
| R43 | MUST | Record a step-indexed trajectory: action, arguments, every approval and denial, screenshots; hosted APIs leave some approvals out of history, so we log them ourselves | [data](safety-data-and-audit.md) |
| R44 | MUST | Redact secrets, keep screenshots out of general logs, apply a retention policy | [data](safety-data-and-audit.md) |
| R45 | SHOULD | Log per-request token usage and stage timings | [computer toolset](api-sdk-computer-toolset.md) |
| R46 | SHOULD | Replay viewer with a screenshot timeline per run | [environments](comparison-environments.md) |
| R47 | SHOULD | Record attempted versus completed call IDs to reconcile after interruption | [computer toolset](api-sdk-computer-toolset.md) |

## Evaluation

| ID | Level | Requirement | From |
|---|---|---|---|
| R48 | MUST | Judge success from real application state, never from the model's final message | [api](api-contract.md) |
| R49 | MUST | Repeatable lab scenarios, each run on a fresh copy of a local test app | [environments](comparison-environments.md) |
| R50 | SHOULD | Compare designs on success, time, turns, recovery and permission adherence | [api](api-contract.md) |
| R51 | SHOULD | Test an allowed and a blocked case for every policy rule | [isolation](safety-isolation-and-approvals.md) |
| R52 | LATER | Benchmark on OSWorld or WebArena style tasks against the reported CUA baseline (pass@1, at most 200 steps, confirmations off) | [Operator card](system-card-operator.md) |
| R53 | LATER | Learn reusable skills from user demonstrations, as Record & Replay does | [capture](product-capture-features.md) |
| R59 | LATER | Automated red teaming that grows the injection suite and retunes defences, as OpenAI did for Atlas | [history](product-history.md) |
| R58 | SHOULD | Measure confirmation recall per action category and prompt-injection susceptibility on our suites, against the published rates (Operator 92% recall, 23% susceptibility), plus the injection monitor's false positives on benign screens | [Operator card](system-card-operator.md), [agent card](system-card-chatgpt-agent.md) |

**Inference:** R43, R48 and R49 together give the feedback loop needed to tune prompts, schemas and safety
rules before any LATER item is worth building.
