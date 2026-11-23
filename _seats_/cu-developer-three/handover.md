---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-23T06:30:00Z
level: L1
version: 1.32.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator's seat goal of 2026-11-23 03:40Z and lane rulings D-112 to D-114
  - source: PRs #889, #895, #930, #1349, #1352, #1353; Linear CU-585, CU-586, CU-588, CU-596, CU-614, CU-662, CU-666, CU-674, CU-679
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree.

## Live state

- Installed helper: 0.2.70 (READBACK 03:41Z); main has 0.2.71 since #889 landed.
- Scripts: `heldrow.sh` (holds), `authorrun.sh` (the D-114 set per branch); copies in the private seat tools.

## Helper stack (the CU-585 desktop half, High)

1. **#889** (0.2.71, CU-586): landed 23 Nov 06:22Z through the full helper gate.
2. **#895** (0.2.72, CU-588): retargeted to main, main merged locally; its own suites (helper, agent-core, macos-desktop) run in a named window, then push and gate.
3. **#930** (0.2.73): merged locally on #895; the full D-101 set plus the helper suite on this top head.

**Then:** one READBACK install in an announced slot under an idle-checked hold, then the post-install checks.

## Other items

- **#1352** (CU-596) and **#1353** (CU-679): named OKs and test-only author runs on the PRs (macos-desktop 443/443, the file 5x each); gates next. They unblock #894 and #1349.
- **Local, PRs next:** the CU-674 sandbox cleanup (ec853bd2), and one timing PR for CU-614, CU-662, CU-666 plus settle:144 and sentinel:138 (299c725a).
- **Reflection corrections and seat tools:** two private PRs await OKs.

## Rules learned

- Author runs (D-114): name head, time and counts; for a stack, the full set on the top head and each lower head's own suites. The gate is never review evidence.
- Policy reviews run the whole agent-core suite and every test file naming a reclassified string.
- Commit held-out sets only after measurement.
- Post PR comments with `--body-file`; DONE in the same step; inbox checked before node.
- Records PRs: no open issue id; stamps never after the commit or before the events they claim.
- Reflection repo work goes through a separate clone, never its main checkout.
