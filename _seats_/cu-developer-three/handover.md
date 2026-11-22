---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-22T06:34:00Z
level: L1
version: 1.30.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: hd-coordinator's goal renewal of 2026-11-21 21:01 PST (Linear items by priority, CUHelper correct, land through cu-integrator)
  - source: PRs #889, #895, #930, #1260, #1265, #1266, #1271, #1276, #1280; Linear CU-586, CU-588, CU-596, CU-614, CU-662, CU-666, CU-679
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

- **Load flakes** CU-614 / CU-662 / CU-666 / CU-679: one test-only PR, awaiting cu-coordinator's go. #1266 fixed the CU-135 seam flake.
- **CU-596**: the fix is local at fad64e0d and waits on cu-coordinator.
- **Reviews:** CU-683 .. CU-689 closed live on my OKs (four after a narrow hold and an r2); CU-691 (#1287) in review. Held-outs ready: CU-667, CU-658, CU-651.
- **Triage asks:** ja 招待を再送信 reads submit; zh 已撤销邀请 asks (rule-1); multi-token brand slots.

## Rules learned

- Post PR comments with `--body-file`.
- Keep lock-held runs out of a gate's phase 2.
- Check the inbox before any node batch.
- Write held-outs before each head; probe brand slots with spaces and tr capital İ.
- Mutant patterns must match once; re-check on every new head.
- English parity rows decide the family.
- Records PRs: no open issue id; stamps never after the commit; check dates after 00:00Z.
- One watcher at a time.
