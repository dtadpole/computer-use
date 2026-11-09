---
title: Desktop human control verifier
created: 2026-11-02T10:18:03Z
modified: 2026-11-09T15:00:00Z
version: 0.6.2
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

History: each check was added with the mutant that proves it, verdict 0 on main each time - H1-H4 (0a3cffc38,
3 of 3 caught), H5-H7 live view, take over and link rights (e99208c6e, 6 of 6), H8 consent in the live view
(0c97fbdc2), H9 local input while consent waits (cb3c72c24), H10 the settle after a resume (f9dd8df6f).

## Owner session (step 4, G2, the Replace chain)

One sitting with the owner under an enforced hold (D-053), every input through CUHelper (D-056), no owner setting
changed. cu-verifier re-runs the scripted part of step 4 after every helper install.

1. Step 4 (CU-11): under the seat's own hold (`run-lock.mjs hold --seat <seat> ...`, keep its token; CU-305 needs
   `CU_DESKTOP_SEAT=<seat>` for the fixture launch), `CU_VERIFY_SEAT=<seat> ROUNDS=80 node _verifiers_/desktop-human-control/owner-step4.mjs`
   (`CU_ASK_OWNER=1` at the Mac, for the Confirm prompt). The owner opens the control
   link in their own Terminal (the printed `control-link` command), presses a key (the run pauses before its next
   event), resumes in the live view, takes over, hands back, stops. Pass: each step in the run's events, no synthetic
   event between the key press and the resume, only tagged events in the fixture's input log.
2. G2 (CU-119): the owner presses a key during a scripted key hold; the hold releases at once and the notice names it.
3. The Replace chain (CU-135): the owner approves the file choice on the real save panel; the system's 'already
   exists - Replace?' sheet must then be asked separately, as delete.

## Read next

[../INDEX.md](../INDEX.md).
