---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-08T23:12:00Z
level: L1
version: 1.4.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (owner's order - one successor per seat; handover before stand-down)
  - source: Linear CU-227, CU-240, CU-252, CU-289, CU-292, CU-295 (8 Nov)
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Scratch scripts in `/tmp/cu-developer-three-scratch` (re-read before use):
`install-held.sh <version>` (idle check, no gate or waiter, hold, install, READBACK), `held-run.sh <script> <purpose>`
(an idle-checked hold around one scripted CU Fixture measurement), `locked.mjs` (run under the desktop-run lock).

## Live state

- Installed helper: 0.2.56 (READBACK OK, sha256 7e276fa7). 0.2.57 (CU-227) is on main, not yet installed; install it
  and 0.2.58 back to back.
- #150 (0.2.58: CU-292's floor, CU-295's helperCheckouts allowlist) was taken over by the successor at 727226c. After
  it lands: add the two helperCheckouts entries to this Mac's local config, install, then show hd-coordinator READBACK,
  the start-log `checkouts:` line, and noInput runs admitted from a new worktree and an old path, one refused.

## CU-252 (in flight)

The stand-in's rows gave the helper nothing (probes 215355Z, 221544Z): every row hit-tests as an unnamed AXStaticText,
and selectedItems reads unreadable. An NSView's AXFilename and AXURL do reach the helper (the AXImage target). Fix
on branch `cu/cu-developer-three-cu-252-finder-shape` (worktree `/tmp/cu-dev3-wt-252b`): the row view drops its
role override, and the cell (NSTableCellView) carries AXFilename and AXURL. Probe 4 on that fixture decides it; then
open the PR. cu-developer-one's fail-closed rule (#153) asks on an unreadable read in any app.

## Issues

Verify: CU-227, CU-240, CU-250, CU-262, CU-289. In Progress: CU-292, CU-295 (#150). Todo: CU-203 (owner session).

## Rules learned

Every CUHelper-starting run goes under the lock; announce a hold only after it succeeds. Never merge main into a PR in
cu-integrator's chain. A config-read allowlist matches real paths only. Check live-row chords against macOS hotkeys.
