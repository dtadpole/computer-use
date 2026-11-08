---
title: Desktop action contract verifier
created: 2026-11-02T09:25:25Z
modified: 2026-11-05T12:41:51Z
version: 0.3.0
description: Judges the macos-desktop driver's GA actions as helper events against the fake helper, with seven mutants; the batch half follows agent core's C5.
grounded_in:
  - source: _designs_/desktop-extension/input-and-targets.md@0.3.2
---

# Desktop action contract verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | C1-C8 and the mutant each must catch |
| [check.mjs](check.mjs) | the driver on the fake helper (this tree's copy, the instrument) |
| [mutants.mjs](mutants.mjs) | seven broken planners for `prove-failing.mjs` |
| [verify.sh](verify.sh) | the entry point |

| Run, 2026-11-02 | Verdict |
|---|---|
| main with the M7 slice | 0, all 8 checks |
| main edfb73be2, D-031: C8 keeps navigate and unknown actions; C8b (Command chords, clipboard part skipping until the driver drops D-025); paste-allowed removed | 3: C8b's clipboard part skips, the rest hold; prove-failing 6 of 6. With the refusal removed in a scratch tree: 0, all 9 |
| main 0611092d5 (#497: the driver allows clipboard chords) | 0, all 9 checks, C8b judged; prove-failing 7 of 7 (clipboard-chord-refused by C8b) |
| prove-failing | 7 of 7 caught, each by its own check |

## Read next

[../INDEX.md](../INDEX.md).
