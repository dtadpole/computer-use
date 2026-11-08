---
title: Desktop agent loop verifier
created: 2026-11-02T09:38:37Z
modified: 2026-11-02T09:38:37Z
version: 0.1.0
description: Judges batch refusal, step and time bounds and cancel through real desktop runs of agent core on the fake helper, with four mutants.
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0 (agent loop row)
---

# Desktop agent loop verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | L1-L4 and the mutant each must catch |
| [check.mjs](check.mjs) | the four checks, on the run harness of [desktop-consent](../desktop-consent/harness.mjs) |
| [mutants.mjs](mutants.mjs) | four broken loops for `prove-failing.mjs` |
| [verify.sh](verify.sh) | the entry point |

| Run, 2026-11-02 | Verdict |
|---|---|
| main 2026-11-02 09:35Z | 0, all 4 checks |
| prove-failing | 4 of 4 caught, each by its own check (a lone loop checkpoint removal is rightly not caught) |

## Read next

[../INDEX.md](../INDEX.md).
