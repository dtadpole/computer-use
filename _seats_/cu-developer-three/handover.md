---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-16T13:30:00Z
level: L1
version: 1.17.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: hd-coordinator's goal renewal of 2026-11-16 05:10 PST (Linear items by priority, CUHelper correct, land through cu-integrator)
  - source: CU-387 live drag row 20261116T131743Z-f9cb00 (closed by cu-verifier 13:20Z); PR #889 (CU-586)
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree (D-080).

## Live state

- Installed helper: 0.2.70, the same as main's helper source.
- The hold wrapper needs `CU_DESKTOP_SEAT=cu-developer-three` (CU-305). Fixture launches refuse without it.
- Scratch tools live in a git-excluded `.cu3-tools/` folder of the session worktree:
  - `guarded.sh`, `lockstate.sh`, `send.sh`;
  - the corpus tool `lost-asks2.mjs`;
  - `row387.mjs` + `held387.sh`, a live fixture row under an idle-checked hold.

## Linear

- **CU-387: Done.** The drag into the real CU Ledger asks permission, with fileFrom ancestor.
- **CU-372: In Progress.** Step 2, a key on a closed pop-up, needs the pop-up focused. That needs Full Keyboard
  Access, the owner's setting, which is not to be touched. cu-coordinator decides: a fixture focus step, or name it
  a limit.
- **CU-586: In Progress, PR #889** (helper 0.2.71: the dialog-text walk skips controls).
  - Tests: helper.test 55/55 under the lock; helper-sources + build-lock 29/0.
  - Next: two OKs, then an idle-checked install with READBACK.
- **CU-203:** in Verify (cu-verifier's).

## Duties

- Desktop corpus diffs on each new head of a table PR: adds only, both routes, labelled not-a-review.
- Class coverage is the probe kit's class sweeps (#878).

## Rules learned

- Fetch PR heads into named refs (`origin/<branch>`). A parallel job's FETCH_HEAD can swap under you.
- Never remove a worktree a running job uses.
- An OK covers only what it lists: name what it did not test.
