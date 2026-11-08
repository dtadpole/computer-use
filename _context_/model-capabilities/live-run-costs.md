---
title: Cost of live computer-use runs on the gateway
created: 2026-11-01T10:20:00Z
modified: 2026-11-01T10:20:00Z
level: L1
version: 1.0.0
description: What one live run of the agent costs on model-a and claude-sonnet-5-5, from measured token figures, with and without prompt caching, and what that means for the M2 live runs and the run caps.
status: unverified
grounded_in:
  - source: 'gateway probes by cu-researcher, 2026-11-01 (token counts in claude-images.md and claude-computer-tool.md; prompt-caching probe 10.15 UTC)'
  - source: platform.claude.com/docs/en/about-claude/pricing (fetched 2026-11-01)
  - source: _designs_/system-architecture/run-outcomes.md (design 0.8.1)
---

# Cost of live runs on the gateway

Asked by the coordinator for M2. Prices are Anthropic's list prices per million tokens [price]; the gateway's
backend looks like Google Cloud, whose billing may differ, so treat every figure as an estimate.

| Model | Input | 5-minute cache write | Cache read | Output |
|---|---|---|---|---|
| model-a | $4 | $5 | $0.20 | $20 |
| claude-sonnet-5-5 | $2 | $2.50 | $0.10 | $10 |

## Measured inputs

- Each request carries about 4,600 tokens of toolset and task; each 1280x800 screenshot adds about 1,430
  ([Claude images](claude-images.md)). Nothing is pruned and the gateway ignores server-side clearing
  ([Claude tool](claude-computer-tool.md)), so request k holds all k screenshots.
- Output was 98 to 146 tokens a step at default effort; the high row assumes 800 with heavier thinking (inference).
- **Prompt caching works:** with `cache_control` on the toolset and on the last `tool_result`, a repeated
  four-screenshot request wrote 10,275 tokens to the cache, then read all 10,275 back on the second call.

## One run, 1280x800

| Steps | Input over the run | Opus cached | Opus uncached | Sonnet cached | Sonnet uncached |
|---|---|---|---|---|---|
| 5 | 47k | $0.08 to $0.15 | $0.20 to $0.27 | $0.04 to $0.08 | $0.10 to $0.13 |
| 8 | 94k | $0.13 to $0.23 | $0.40 to $0.50 | $0.06 to $0.12 | $0.20 to $0.25 |
| 12 | 179k | $0.19 to $0.34 | $0.75 to $0.91 | $0.09 to $0.17 | $0.38 to $0.45 |
| 20 | 424k | $0.32 to $0.58 | $1.76 to $2.02 | $0.16 to $0.29 | $0.88 to $1.01 |

Ranges span 150 to 800 output tokens a step. At 1440x900 a screenshot costs about 1,800 tokens (computed from
`ceil(w/28) x ceil(h/28)`), roughly 15% more.

## For M2 (inference)

- Three tasks on two models, three attempts each, is 18 runs. The documented tasks need about 5 to 8 steps:
  roughly **$1.10 to $3.20 with caching**, $2.70 to $6.80 without. The caps bound the worst case at $1.00 a run, $18.
- **Set cache breakpoints in the adapter**: one on the toolset entry and one on the newest `tool_result`, advancing
  each turn. A 20-step Opus run drops from about $1.76 to $0.32.
- Uncached, an Opus run passes the $1.00 `maxCostUsd` at step 15. Without configured prices, the 400,000
  `maxTokens` fallback is passed at step 20, or at step 18 at 1440x900, if cache reads count as input. Configure the
  prices above so `maxCostUsd` governs, or count cache reads separately.

[price]: https://platform.claude.com/docs/en/about-claude/pricing
