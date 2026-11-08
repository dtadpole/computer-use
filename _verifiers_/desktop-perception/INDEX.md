---
title: Desktop perception verifier
created: 2026-11-02T09:21:10Z
modified: 2026-11-02T09:21:10Z
version: 0.1.0
description: Judges the macos-desktop driver's point mapping against the fake helper on four declared displays and two image limits, with five mutants.
grounded_in:
  - source: _designs_/desktop-extension/capture-and-scaling.md@0.3.1
---

# Desktop perception verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | D1-D3 and the mutant each must catch |
| [check.mjs](check.mjs) | the driver on the fake helper (this tree's copy, the instrument) |
| [mutants.mjs](mutants.mjs) | five broken mappings for `prove-failing.mjs` |
| [verify.sh](verify.sh) | the entry point |

| Run, 2026-11-02 | Verdict |
|---|---|
| main with the M7 slice (84e5393f4) | 0, all 12 checks |
| prove-failing | 5 of 5 caught; no-origin only by the secondary display |

## Read next

[../INDEX.md](../INDEX.md).
