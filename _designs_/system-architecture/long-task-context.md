---
title: Long-task context - screenshots in the request
created: 2026-11-06T06:45:57Z
modified: 2026-11-06T14:25:23Z
level: L1
version: 0.1.8
description: How the claude-gateway adapter keeps a long run's request inside the context window and the image cap - prune old screenshots rarely, in one large step past a ceiling, so the prompt cache breaks seldom.
status: unverified
grounded_in:
  - source: Linear CU-65 (cu-researcher's measurement of 2026-11-06, the second batch's longest run)
  - source: anthropics/claude-quickstarts computer-use-demo loop.py (_maybe_filter_to_n_most_recent_images; pruning off when caching is on), fetched 2026-11-06
  - source: _tools_/agent-core/adapter-claude.mjs (CLAUDE_IMAGE_LIMITS, placeCacheBreakpoint)
  - source: cu-researcher's long-stepper live run of 2026-11-06 (run 20261106T090544Z-ea64ca, main with PR 156)
---

# Long-task context: screenshots in the request

## The problem (CU-65)

The claude-gateway adapter keeps the whole conversation, so every screenshot rides in every later request. On the second batch's longest run the prompt grew about 2.85k tokens per turn, all cached. Extrapolated, a 50-step task carries about 150k tokens and a 200k-token window fills near 65-70 steps. Frames are
fitted within 2000x2000 (`CLAUDE_IMAGE_LIMITS`), so the many-images limit never applies.

## What not to do

Pruning every few turns trades cheap cache reads (a tenth of the input price) for cache writes from the first removed image. Anthropic's reference loop prunes no images when caching is on. Items under 30 turns never need it.

## The rule

| Rule | Value | Why |
|---|---|---|
| ceiling | a request would hold more than 30 images | about 85k tokens at 1920x1080 - clear of the window and the cap |
| prune to | the newest 10 images | the model acts on recent screens; one cache rewrite per 20 turns |
| what goes | image blocks only, oldest first | text - task, actions, results, refusals, consent notes - is never removed |
| in each place | one text line, `[an earlier screenshot was removed to keep the request small]` | the model knows a screen is missing, not that nothing happened |
| record | `model_turn.context {images, removed}` | the trajectory shows when; the run directory keeps every screenshot |

It is client-side, so it holds whatever the gateway passes. A prune edits the prefix of every later
thinking block, which Opus and Sonnet 5.5 check (preserved thinking): an account created since 2026-08-31 gets a 400.
So no new cut is made while any assistant turn carries thinking; the turn records `pruneSkipped: 'thinking'` (CU-84).
An operator may set `--prune-with-thinking allow` for an account proven not to enforce the check, as this gateway's is
(probe and live run below); if the API still refuses a cut, the turn goes again with the last accepted
cut and pruning stops (`thinking_rejected`), or the run ends (`thinking_rejected_over_cap`) if that request
would pass the image or size limit; only that rejection (error type and words) is resent. With `skip`, or
after a freeze, the growth returns: today's items (at most 45 steps) stay under the cap; past it nothing is sent: the run ends `context_full` (CU-91). The gateway rejects `block_binding`, so `drop_block` is closed. Server-side tool-result clearing (`clear_tool_uses_20250919`) is the alternative if the gateway ever passes it.

## Proving it

Unit tests: at or below the ceiling the request is byte-identical; past it exactly the newest 10 images remain, no
text goes, the breakpoint stays on the newest result. Live (2026-11-06, long-stepper, Sonnet, 37 turns): request 31 held 10 images, 21 removed, the cut unmoved; one
cache rewrite (36,040 tokens); every screenshot kept; passed. Under CU-84 (cu-verifier, through the suite):
the default run kept every image with `pruneSkipped: 'thinking'` past 30 and no cache rewrite; with `allow` it pruned as above (runs 20261106T114521Z-cdb2ac, 20261106T114037Z-e5f3be; both passed). On real work (chain-rows, Sonnet,
38 turns, passed) the default kept all 38 screenshots; per-turn cost rose from 0.010 to 0.021 USD.
