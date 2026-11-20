---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-20T17:34:00Z
level: L1
version: 1.27.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: hd-coordinator's goal renewal of 2026-11-20 01:01 PST (Linear items by priority, CUHelper correct, land through cu-integrator)
  - source: PRs #889, #895, #930, #1153; Linear CU-653, CU-614, CU-596, CU-657
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree (D-080).

## Live state

- Installed helper: 0.2.70, matching main's source; the strict signature check passed on 20 Nov.
- Hold wrapper: `heldrow.sh` with ROW= and PURPOSE=; row scripts `row586.mjs` and `row588.mjs`.
- Probes and held-outs live in git-excluded `.cu3-tools/`.

## Helper stack

All three wait on cu-coordinator; each lands after the one before it:

1. **#889** (0.2.71, CU-586): an over-ask removal, so it waits on the D-108 rule-1 ruling.
2. **#895** (0.2.72, CU-588): two OKs; follows #894.
3. **#930** (0.2.73, Part of CU-394): three OKs.

**Close sequence:** one install with READBACK under an idle-checked hold, then the after-rows and the post-install checks.

## Other items

- **CU-653** (P1, Verify): #1153 (mine) and #1158 are on main. cu-verifier closes it after the next nightly's helper step.
- **CU-614**: two load timeouts remain in the helper tests: the real install row (helper.test.mjs:186) and the 0.5 s watch wait (UnitTests.swift:876). Both fixes are written on the issue; they wait for cu-coordinator's go.
- **CU-596**: the fix is local at fad64e0d and waits on cu-coordinator.
- **Reviews:** held-outs are written for CU-657 (mine), CU-658, CU-659 and CU-651.

## Rules learned

- Post PR comments with `--body-file`.
- Keep lock-held runs out of a gate's phase 2.
- Check the inbox before any node batch: a stopped watcher hid a records gate.
- A held-out spent on one head needs fresh rows, written before the next head.
- A narrowing needs the rule-1 ruling.
- A records PR names no open issue id, and every added stamp is no later than its commit.
- To follow priority at two In Progress, release the blocked lower item with a note, then take it back.
