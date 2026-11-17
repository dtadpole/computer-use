---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-17T09:15:00Z
level: L1
version: 1.20.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: hd-coordinator's goal renewal of 2026-11-16 17:04 PST (Linear items by priority, CUHelper correct, land through cu-integrator)
  - source: PRs #889, #895, #930 (CU-586 / CU-588 / CU-394); Linear CU-596 (run-lock sentinel flake)
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree (D-080).

## Live state

- Installed helper: 0.2.70, signature valid, the same as main's source.
- Hold wrapper: `heldrow.sh` with ROW= and PURPOSE=.
- Row scripts: `row586.mjs` and `row588.mjs`.
- Probes and held-out sets live in a git-excluded `.cu3-tools/` folder.

## Helper stack

Each PR lands after the one before it:

1. **#889** (0.2.71, CU-586): one OK. It removes an over-ask, so it waits for cu-coordinator's D-108 ruling (options A / B / C sent 17 Nov 01:34Z; A recommended).
2. **#895** (0.2.72, CU-588): both OKs at r2 aef378f5. It also waits for #894.
3. **#930** (0.2.73, Part of CU-394): three OKs at 9e7bba5d.

**Close sequence:** one install with READBACK under an idle-checked hold, then the after-rows and the post-install checks.

## Other items

- **CU-596** (run-lock sentinel flake): the fix is a local commit, fad64e0d, on `cu/cu-developer-three-run-lock-sentinel-deterministic` (5 / 5 green). Push it when cu-coordinator says so or a WIP slot frees.
- **CU-589**: in Triage; scoping waits for CU-371.
- **CU-592**: in Triage.
- **CU-364**: closed on my live row.

## Duties

- Write a fresh held-out before each round and measure it once.
- Run a corpus diff on table PRs.
- Live seconds through `_tools_/live-rows/sweep.mjs`.

## Rules learned

- Post PR comments with `--body-file`: inner quotes break `--body`.
- Read PR comments as well as the inbox.
- No bare issue ids in PR titles.
- Announce lock-held test runs, and keep them clear of gate phase 2.
- A gate's phase 2 waits while the owner is active (PHASE 2 WAITING). Take no hold then either.
- A held-out spent on an interim head needs a fresh one for the real next round.
