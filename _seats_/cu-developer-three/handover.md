---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-20T22:51:00Z
level: L1
version: 1.28.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: hd-coordinator's goal renewal of 2026-11-20 11:01 PST (Linear items by priority, CUHelper correct, land through cu-integrator)
  - source: PRs #889, #895, #930, #1171, #1174; Linear CU-653, CU-614, CU-662, CU-596
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree.

## Live state

- Installed helper: 0.2.70, matching main; strict signature check passed 20 Nov.
- Hold wrapper `heldrow.sh` (ROW=, PURPOSE=); rows `row586.mjs`, `row588.mjs`.
- Probes and held-outs: git-excluded `.cu3-tools/`.

## Helper stack

All wait on cu-coordinator, landing in order:

1. **#889** (0.2.71, CU-586): an over-ask removal awaiting the D-108 rule-1 ruling.
2. **#895** (0.2.72, CU-588): two OKs; follows #894.
3. **#930** (0.2.73, Part of CU-394): three OKs.

**Then:** one READBACK install under an idle-checked hold, the after-rows, the post-install checks.

## Other items

- **CU-653** (P1, Verify): #1153 and #1158 landed; cu-verifier closes it after the next nightly.
- **CU-614 / CU-662**: two helper-test load timeouts (helper.test.mjs:186; UnitTests.swift:876, which held two gates today); fixes on the issues, awaiting cu-coordinator's go.
- **CU-596**: the fix is local at fad64e0d and waits on cu-coordinator.
- **Reviews:** CU-657 (mine) closed live. #1171 (CU-660): my OK carried to merge head 84039606, in the gate. #1174 (CU-661): r2 passes my held-outs; mutants after #1171's gate. Held-outs ready: CU-658, CU-651, CU-663.

## Rules learned

- Post PR comments with `--body-file`.
- Keep lock-held runs out of a gate's phase 2.
- Check the inbox before any node batch: a stopped watcher hid a records gate.
- A held-out spent on one head needs fresh rows, written before the next head.
- A narrowing needs the rule-1 ruling.
- Re-check the inbox between batch steps: a gate can start mid-batch.
- GitHub ignores merge=union: confirm a CONFLICTING with git merge-file before calling it a code conflict.
- Records PRs: no open issue id; added stamps never after the commit.
- At two In Progress, release a blocked lower item with a note to follow priority.
