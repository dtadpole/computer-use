---
title: Desktop trajectory verifier
created: 2026-11-02T09:45:36Z
modified: 2026-11-05T14:38:39Z
version: 0.3.0
description: Judges the desktop trajectory's privacy and mapping records through agent-core runs on the fake helper and a leaky stand-in helper, with two mutants.
grounded_in:
  - source: _designs_/desktop-extension/trajectory-privacy.md@0.3.2
---

# Desktop trajectory verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | T1-T5 and the mutant each must catch |
| [leaky-helper.mjs](leaky-helper.mjs) | a stand-in helper that leaks out-of-scope titles, in front of the fake |
| [check.mjs](check.mjs) | the six checks: runs on the harness of [desktop-consent](../desktop-consent/harness.mjs), and one startRun with onEvent |
| [mutants.mjs](mutants.mjs) | three broken agent cores for `prove-failing.mjs` |
| [verify.sh](verify.sh) | the entry point |

| Run, 2026-11-02 | Verdict |
|---|---|
| main 0f932cfe0 | 1: T2b (secure-field text unredacted) and T3 (no mapping) fail, both reported; T1, T2a hold |
| prove-failing | 2 of 2, each failing its own passing check |
| main 4292bb4c8 (#205, #227, #257 in), T5 added | 0, all 5 checks (T2b and T3 hold); prove-failing 3 of 3 |
| main e99ec2f10 and PR #565 (driver capture_leak), T1 split from T6 | 0, all 6 checks on both; prove-failing 3 of 3 |

## Read next

[../INDEX.md](../INDEX.md).
