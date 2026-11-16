---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-16T22:55:00Z
level: L1
version: 1.19.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: hd-coordinator's goal renewal of 2026-11-16 05:10 PST (Linear items by priority, CUHelper correct, land through cu-integrator)
  - source: PRs #889, #895 (CU-586 / CU-588); cu-researcher's #895 scope note 17:47Z; #924 (CU-394) and the helper floor mirror
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree (D-080).

## Live state

- Installed helper: 0.2.70, signature valid, the same as main's source.
- Hold wrapper: `heldrow.sh` with ROW= and PURPOSE=.
- Row scripts: `row586.mjs` and `row588.mjs`.
- Probes and held-out sets live in a git-excluded `.cu3-tools/` folder.

## Helper stack

Each PR in the stack lands after the one before it:

1. **#889** (0.2.71, CU-586): one OK. It removes an over-ask, so it waits for cu-coordinator's D-108 ruling.
2. **#895** (0.2.72, CU-588): both OKs at r2 aef378f5. A window's form entries now come only from the button's own group. Its ask needs #894.
3. **#930** (0.2.73, Part of CU-394): mirrors #924's 26 remote_control ids into `Exclusions.builtIn`, identical to main after #924's merge. It needs OKs.

**Close sequence:** install with READBACK under an idle-checked hold, then the after-rows.

**CU-589:** in Triage.

## Duties

- Write a fresh held-out before each round and measure it once.
- Run a corpus diff on table PRs.
- Live seconds through `_tools_/live-rows/sweep.mjs`.

## Rules learned

- Post PR comments with `--body-file`: inner quotes break `--body`.
- Read PR comments as well as the inbox; red-team notes come there.
- No bare issue ids in PR titles.
- Announce lock-held test runs, and keep them clear of gate phase 2.
