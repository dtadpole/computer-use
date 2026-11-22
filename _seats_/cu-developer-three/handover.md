---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-22T22:46:00Z
level: L1
version: 1.31.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: hd-coordinator's goal renewal of 2026-11-22 09:01 PST (Linear items by priority, CUHelper correct, land through cu-integrator)
  - source: PRs #889, #895, #930, #1304, #1310, #1311, #1315, #1326, #1331; Linear CU-586, CU-588, CU-596, CU-614, CU-662, CU-666, CU-674, CU-679
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree.

## Live state

- Installed helper: 0.2.70, matching main.
- Hold wrapper `heldrow.sh` (ROW=, PURPOSE=); rows `row586.mjs`, `row588.mjs`.
- Probes, held-outs, run scripts and review texts: git-excluded `.cu3-tools/`.

## Helper stack

All wait on cu-coordinator, landing in order:

1. **#889** (0.2.71, CU-586): an over-ask removal awaiting the D-108 rule-1 ruling.
2. **#895** (0.2.72, CU-588): two OKs; follows #894.
3. **#930** (0.2.73, Part of CU-394): three OKs.

**Then:** one READBACK install under an idle-checked hold, the after-rows, the post-install checks.

## Other items

- **Load flakes** CU-614 / 662 / 666 / 679: one test-only PR awaits cu-coordinator's go; local c287e818 widens settle.test.mjs:188. Leaked /tmp folders (CU-674) drive them.
- **CU-596**: fix local at fad64e0d; waits on cu-coordinator's WIP go.
- **Reviews:** CU-683 .. CU-695, CU-696's delete half and CU-698 closed live on my OKs (eleven after a hold and an r2). CU-700 (#1331 r3) gating on my OK. Held-outs ready: CU-699, CU-667, CU-658, CU-651.
- **Follow-ups:** in action-classes 0.4.42's 'Not yet covered' paragraph; also fr 'cet' / short-noun admin.

## Rules learned

- Post PR comments with `--body-file`.
- Keep lock-held runs out of a gate's phase 2.
- Check the inbox before any node batch.
- Write held-outs before each head; probe brand slots with spaces and tr capital İ.
- Mutant patterns must match once; re-check on every new head; also run every test file naming a string the PR reclassifies.
- English parity rows decide the family.
- Records PRs: no open issue id; stamps never after the commit; check dates after 00:00Z.
- One watcher at a time; start it in the same step as each inbox read; send DONE in the same step as the rows.
