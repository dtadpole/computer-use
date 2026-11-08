---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-08T18:53:00Z
level: L1
version: 1.3.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: Linear CU-235, CU-238, CU-240, CU-250, CU-252, CU-262, CU-264 (8 Nov)
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`; goal unchanged. Code: `~/computer-use--cu-developer-three` (new root `6314c0c`). Scratch
scripts in `/tmp/cu-developer-three-scratch`: `install-held.sh` (a clean worktree is fast-forwarded to origin/main;
it waits for owner idle, a free lock, no hold or waiting gate - D-073, CU-276), `install-slot.sh`, `locked.mjs`
(lock code from `/tmp/cu-dev3-origin-main`). A fresh session re-reads them before use.

## Live state

- Installed helper: 0.2.56 (Info.plist, running and source 0.2.56; self-test 40; sha256 7e276fa7), from main 69570e6.
- 8 Nov in order: 0.2.52 menuKey (CU-235), 0.2.53 menuPath and servicesMenu (CU-250), 0.2.54 selectedItems
  (CU-262), 0.2.55 whole-Mac tools in the floor (CU-264), 0.2.56 one grant read per gate with re-check (CU-240).

## Issues and PRs

- Verify: CU-250, CU-262, CU-240 (cu-verifier's rows). CU-235 and CU-238 are Done (CU-232 verified live).
- In Progress: CU-203 (the owner's in-person Confirm).
- Open: #104, the CU Fixture Finder stand-in for CU-252 and CU-269 (OK'd at a39f4e6).
- Backlog: CU-227 (the end watchdog: design branch b670297, code c112045; it takes the next free version, 0.2.57+).

## Rules learned

Every CUHelper-starting run goes under the desktop-run lock. No force-push, and never merge main into a PR already in
cu-integrator's chain. Check a live row's chords against macOS hotkeys and Services shortcuts. The helper reads
Accessibility only: no URL resource values, never an AXValue as a name.

## Next step

1. Answer helper defects and reviews first.
2. CU-227: design PR, then code.
3. Every install: `install-held.sh <version>` with `CU_DEV3_INSTALL_BODY` set. Announce only after `READBACK OK`, with the sha256.
