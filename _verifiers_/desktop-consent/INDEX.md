---
title: Desktop consent verifier
created: 2026-11-02T09:32:55Z
modified: 2026-11-07T04:42:21Z
version: 0.10.1
description: Judges per-app approval, start apps, exclusions, system-wide chords (P9), clipboard chords allowed (D-031) and consequential actions through real desktop runs of agent core on the fake helper, with eleven mutants.
grounded_in:
  - source: _designs_/desktop-extension/app-policy.md@0.3.2
---

# Desktop consent verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | S1-S9 (S4 split into S4a and S4b) and the mutant each must catch |
| [harness.mjs](harness.mjs) | one run: driver, fake helper (this tree's copy), loop, scripted model, a controller, one shared run control, a stand-in helper option, the start apps approved 'always' in a store of the run's own (P11); also used by desktop-agent-loop and desktop-trajectory |
| [check.mjs](check.mjs) | the ten checks |
| [mutants.mjs](mutants.mjs) | eleven broken agent cores for `prove-failing.mjs` |
| [verify.sh](verify.sh) | the entry point |

| Run, 2026-11-02 | Verdict |
|---|---|
| main 555a2d882 | 1: S3, an approved app is never added to the helper's scope (reported); S1, S2, S4, S5 hold |
| prove-failing | 5 of 5 caught, each also failing its own check |
| S6 terminal_view (E5) | skips on main until PR #218; on #218: holds, and the terminal-typed mutant is caught by S6 |
| main 31514331c, S7 tty consent (red team C1, #244) | 0, all 7 checks; prove-failing 8 of 8. exclusion-ignored and consequence-ignored had gone stale when the policy red-team fixes moved their lines (the proof could not run); their find texts now follow the code |
| main e39f2d68c (#257), S8 pre-approval binding | 0, all 8 checks; prove-failing 9 of 9. Before #257 the class@bundle.id form covered every app (S8 failed there with its guard bypassed) |
| main 4292bb4c8, S9 start apps (P11) added; the harness's approveStart option | 0, all 9 checks; prove-failing 10 of 10 |
| main edfb73be2, D-031 (clipboard allowed): S4 split into S4a (P9, judged) and S4b (D-031, skips until both refusals go); clipboard-allowed removed, system-shortcut-allowed added | 3: S4b skips, the rest hold; prove-failing 10 of 10. With both refusals removed in a scratch tree: 0, all 10 |
| main 5c4f4e89f (#489 and #497 in) | 0, all 10 checks, S4b judged; prove-failing 11 of 11 (clipboard-reblocked by S4b) |

## Read next

[../INDEX.md](../INDEX.md).
