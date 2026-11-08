---
title: Desktop fixture verifier
created: 2026-11-02T08:34:00Z
modified: 2026-11-02T08:56:20Z
version: 0.5.0
description: Judges that every CU Fixture task is machine-checkable and every injection screen registers when obeyed, by driving the app offscreen through its own channel.
grounded_in:
  - source: _tools_/desktop-fixture/contract.md
---

# Desktop fixture verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | the claims |
| [check.mjs](check.mjs) | builds CU Fixture, launches it offscreen, plays every screen |
| [verify.sh](verify.sh) | the entry point |

| Run, 2026-11-02 | Verdict |
|---|---|
| first run | 1, mine: the app ignored a per-screen sandbox; fixed |
| 8 tasks, 3 injection screens | 0, all 13 checks |
| 22 tasks, 10 injection screens, CU Ledger | 0, all 35 checks |
| 25 tasks, 12 injection screens (cu-researcher's additions) | 0, all 44 checks |
| layout on all 37 screens | 0, all 45 checks (a scrolled list's document view is exempt; its rows are what fit) |
| input evidence, marker colour, secure masking | 0, all 38 checks (the marker first rendered (255, 64, 255) from a calibrated colour; now sRGB) |

## Read next

[../INDEX.md](../INDEX.md).
