---
title: Desktop helper protocol verifier
created: 2026-11-02T09:04:33Z
modified: 2026-11-02T09:55:36Z
version: 0.4.0
description: Runs the desktop-extension 0.2 protocol conformance checks against the fake helper, and the Swift helper pre-grant; unjudged until a helper lands.
grounded_in:
  - source: _designs_/desktop-extension/helper-and-protocol.md@0.2.0
---

# Desktop helper protocol verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | the claims and the breach each was proven to catch |
| [check.mjs](check.mjs) | each check against the fake helper (stdio) and CUHelper (built by its build.sh, over a mode-700 socket) |
| [verify.sh](verify.sh) | the entry point; `CU_VERIFY_MILESTONE=M7` runs the M7 checks only |

| Run, 2026-11-02 | Verdict |
|---|---|
| no helper on main yet | 3, unjudged |
| main 5dabef497+, M7 checks | 1: CUHelper accepts Script Editor, Automator, Shortcuts (D-025); 15 of 16 hold |
| same, M8 included | 1: plus simulateLocalInput is unknown_request on both helpers (the M8 seam) |
| main 2026-11-02 09:57Z (CUHelper 0.2.0, #184; fake with postEvents, #185) | 0, all 18 checks: the exclusion floor and pause seam are fixed |
| main 2026-11-02 09:35Z, checks at 0.3.1 | 1: the fake's pause holds via idle; both hellos lack postEvents; CUHelper still lacks the three exclusions and simulateLocalInput |
| the checks against the conformant double, and each breach | 8 of 8 hold, 8 of 8 breaches caught |

## Read next

[../INDEX.md](../INDEX.md).
