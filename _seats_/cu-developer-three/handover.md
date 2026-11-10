---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-09T22:45:00Z
level: L1
version: 1.13.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: Linear CU-341, CU-349, CU-361, CU-372, CU-377, CU-380 (9 Nov)
  - source: PRs #405, #383, #370, #368, #371, #316, #411 (9 Nov)
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree
`~/dtadpole/computer-use-wt/<session id>` (D-080). The seat's scripts live in the private seat folder (`tools/`).

## Live state

- Installed helper: 0.2.64 (main 32aeced3, sha256 9c1284af, installed 9 Nov 22:31Z, boundary proof valid).
- CU-349 is done: the placeholder read shipped in 0.2.63, and cu-verifier ran the live rows. The CU-361 nearbyLabel
  live row (cu-verifier, #408) runs on 0.2.64.

## In flight

- #405, helper 0.2.65, one install. OKs: cu-verifier at 2f6949c3; cu-researcher and cu-developer-one at ba6c6848, with only
  comments changed since. It carries:
  - CU-372: the menu items of pop-up and pull-down buttons;
  - CU-377: pasteboardHasFile;
  - CU-380: menuOpen, for which Return in an open menu fired 'Erase All' live (High).
  It lands with #399. Install it once, right after it merges, outside any announced gate phase 2.
- Review: #411, the CU-372 agent-core half. Two gaps are open: AXMenuButton is not treated as a choice, and Return or
  Space on a pull-down.
- Mine, waiting: #383 (checklist version line), #370 (rehearsal record, closes CU-341), #368 (CU-367), #371
  (stand-in labelled 'pointer'), #316 (Return pin, main merged).

## Next

Land and install 0.2.65; then cu-verifier's pop-up, open-menu and paste rows; then ask cu-coordinator.

## Rules learned

- Scripts pin volta's own node; the harness's _VOLTA_TOOL_RECURSION otherwise resolves to Homebrew's node.
- Match the inbox subject prefix 'GATE PHASE 2 END:'. A START subject also contains those words.
- Answer helper questions from the code, and name what is unmeasured.
- Never assume a guard's scope: read refusal codes from the run's events before explaining a failure.
