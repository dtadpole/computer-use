---
title: Desktop helper dry-run verifier
created: 2026-11-02T10:37:30Z
modified: 2026-11-06T04:43:14Z
version: 0.6.0
description: Judges the real CUHelper's input and capture rules before the grant through its dry run - tags, global points, point re-check, release of held input, capture privacy, panels, two displays and Retina scale 2 - each claim with Swift mutants it must catch.
grounded_in:
  - source: _environments_/macos-desktop/helper/dry-run.md
---

# Desktop helper dry-run verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | R1-R18 (with R6b) and the mutant each must catch |
| [check.mjs](check.mjs) | the eighteen checks over the verifier's own worlds, CUHelper built from the code under test |
| [mutants.mjs](mutants.mjs) | twenty-one broken CUHelpers (Swift), rebuilt per mutant |
| [verify.sh](verify.sh) | the entry point |

| Run, 2026-11-02 | Verdict |
|---|---|
| main 89e46bcfc (CUHelper 0.2.3) | 0, all 5 checks |
| prove-failing (Swift rebuilt per mutant) | 4 of 4 caught; the tag is set on the source and on each event, so the untagged mutant removes both |
| main 0c97fbdc2, R6 capture privacy added | 0, all 6 checks; capture-unscoped caught by R6 |
| main d91da8101 (#267, helper 0.2.6), R7 menu-bar mask added | 0, all 7 checks; menu-mask-off caught by R7 |
| main 8b3a4bfdf (#516, helper 0.2.8), R8 settleMs added | 0, all 8 checks; settle-always-honoured and settle-no-cap caught by R8 |
| PR #15 (helper 0.2.14, design 0.4.11) + main, R6b and R9 added | 0, all 10 checks; capture-trusts-sck and owner-rule-off caught |
| #128 head f00d93e86 (helper 0.2.26, CU-51) + R15-R18 (CU-55), 2026-11-06 | 0, all 18 checks; capture-scale-ignored caught by R15 (and R16), menu-bar-every-display by R16, scope-display-first-touched by R17 |

## Read next

[../INDEX.md](../INDEX.md).
