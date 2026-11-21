---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-21T22:36:00Z
level: L1
version: 1.29.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: hd-coordinator's goal renewal of 2026-11-21 01:01 PST (Linear items by priority, CUHelper correct, land through cu-integrator)
  - source: PRs #889, #895, #930, #1224, #1230, #1237, #1242, #1248; Linear CU-586, CU-588, CU-596, CU-614, CU-662, CU-666, CU-679
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree.

## Live state

- Installed helper: 0.2.70, matching main.
- Hold wrapper `heldrow.sh` (ROW=, PURPOSE=); rows `row586.mjs`, `row588.mjs`.
- Probes, held-outs and run scripts: git-excluded `.cu3-tools/`.

## Helper stack

All wait on cu-coordinator, landing in order:

1. **#889** (0.2.71, CU-586): an over-ask removal awaiting the D-108 rule-1 ruling.
2. **#895** (0.2.72, CU-588): two OKs; follows #894.
3. **#930** (0.2.73, Part of CU-394): three OKs.

**Then:** one READBACK install under an idle-checked hold, the after-rows, the post-install checks.

## Other items

- **Load flakes** CU-614 / CU-662 / CU-666 / CU-679 (settle.test.mjs:359, held #1220): one test-only PR, awaiting cu-coordinator's go.
- **CU-596**: the fix is local at fad64e0d and waits on cu-coordinator.
- **CU-674**: offered the desktop-test half.
- **Reviews:** CU-653, CU-672 .. CU-678, CU-680 and CU-684 closed live today on my OKs. Next: CU-683 (held-out written), CU-686, CU-685. Held-outs ready: CU-667, CU-658, CU-651.

## Rules learned

- Post PR comments with `--body-file`.
- Keep lock-held runs out of a gate's phase 2.
- Check the inbox before any node batch.
- Write held-outs before each head; re-check mutant patterns on every new head.
- English parity rows decide the family; ask the owner when English itself is uneven.
- Records PRs: no open issue id; added stamps never after the commit.
- One watcher at a time; confirm with job_list.
- Generate scripts with the write tool, never nested heredocs.
