---
title: Desktop human control verifier
created: 2026-11-02T10:18:03Z
modified: 2026-11-07T11:58:28Z
version: 0.6.0
description: Judges the local-input pause, human-only resume, stop, take over and hand back, and the live view's frames and link rights, through desktop runs on the fake helper, with six mutants.
grounded_in:
  - source: _designs_/desktop-extension/human-control.md@0.3.4
---

# Desktop human control verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | H1-H9 and the mutant each must catch |
| [check.mjs](check.mjs) | the ten checks: runTask on the run harness of [desktop-consent](../desktop-consent/harness.mjs), and live startRun runs for the view and control links |
| [mutants.mjs](mutants.mjs) | ten broken builds for `prove-failing.mjs` |
| [verify.sh](verify.sh) | the entry point |
| [owner-step4.mjs](owner-step4.mjs) | runbook step 4 with the owner present (CU-11): a long scripted CU Fixture run through the installed CUHelper; prints the watch URL and the run id, never the control link |

| Run, 2026-11-02 | Verdict |
|---|---|
| main 0a3cffc38 | 0, all 4 checks |
| prove-failing | 3 of 3 caught, each by its own check |
| main e99208c6e, H5-H7 added (live view, take over, link rights) | 0, all 7 checks; prove-failing 6 of 6, each by its own check |
| main 0c97fbdc2, H8 added (consent in the live view) | 0, all 8 checks; view-can-consent caught by H8; also 8 of 8 on PR #262's head |
| main cb3c72c24 (#263), H9 added (local input while consent waits) | 0, all 9 checks; stop-outlives-wait caught by H9 |
| main f9dd8df6f (#518), H10 added (the settle after a resume) | 0, all 10 checks; settle-every-input and no-settle-after-resume caught by H10 |

## Owner session (step 4, G2, the Replace chain)

One sitting with the owner, under an enforced desktop hold (D-053), every input through CUHelper (D-056), no owner
setting changed. cu-verifier re-runs the scripted part of step 4 after every helper install.

1. Step 4 (CU-11): `ROUNDS=80 node _verifiers_/desktop-human-control/owner-step4.mjs`. The owner opens the control link
   in their own Terminal with the printed `control-link` command, then: presses a key on the Mac (the run pauses before
   its next event), resumes in the live view, takes over, hands back, and stops. Pass: each step recorded in the run's
   events, no synthetic event after the key press until the resume, the fixture's input log shows only tagged events.
2. G2 (CU-119): during a scripted key hold, the owner presses any key; the hold releases at once and the notice names
   the held key.
3. The Replace chain (CU-135, #313 export-overwrite): the owner approves the file choice on the real save panel; the
   system's 'already exists - Replace?' sheet must then be asked separately as delete. About a minute.

## Read next

[../INDEX.md](../INDEX.md).
