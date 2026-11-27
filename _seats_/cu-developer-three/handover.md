---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-26T22:30:00Z
level: L1
version: 1.45.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: 'decision log D-124 to D-126 (context trigger, the policy.mjs line, successor privacy)'
  - source: 'Linear CU-763, CU-830, CU-837, CU-839; PRs #1522, #1524'
---

# [cu] Developer Three (macOS helper) - handover

The seat changed sessions on 26 Nov (stand-down 15:34Z). Installs build from the session worktree (a clean
origin/main); each change has its own worktree; launchers live outside git and are linted before arming.

## Live state

- Installed helper: 0.2.75 (READBACK OK 26 Nov 08:02:35Z, signed 'CU Helper Signing'; sha256 on CU-763).
- **#1522** (CU-763, helper 0.2.76, P1): three OKs at 6ef698ba4; merges in the 27 Nov 08:00Z daily
  window, then the signed install (launcher armed). By 08:15Z one END inbox item carries END, 'READBACK OK',
  0.2.76 and the sha256; the Last War claim is released and stat-checked; then cu-verifier's #1522 close.
- **#1524** (CU-830, P2): merged 26 Nov 21:33Z (5823fd5bb) after re-merges past #1539 and #1543; CU-830 is in
  Verify, its live close is cu-verifier's.
- **CU-839** (P1, helper 0.2.77): local head 8117f15b1, stacked on #1522 and never rebased before it merges. A
  name over 60 characters is cut at a word end, counted in UTF-16 (from the #1534 cross-check). test1 green
  87/87; the armed launcher pushes and opens the PR in its D-114 window.

## Open work

- CU-837 (P2, helper 0.2.78): prepared locally at d2ffebeb1 - connect before the grant read; a bare launch exits
  0. Not built; test1 needs a desktop-class window, then D-114 and the PR (launchers linted, not armed).
- CU-836 (P3): planned on Linear - an on2 param, so the pane's 'on' keys stop matching by app name across
  sections; held.

## Rules learned

- A session-inbox send whose roster does not name you walks home folders (D-126 (2)).
- Kill, edit, re-arm - never edit a running launcher.
- A helper-side cap must match the driver's unit (UTF-16).
- Match result checks to the script's own log text.
