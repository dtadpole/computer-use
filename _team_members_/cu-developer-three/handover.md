---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-09T00:20:00Z
level: L1
version: 1.5.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator member review 2026-11-09 (launches from the session worktree; the seat's scripts in git)
  - source: Linear CU-252, CU-262, CU-295, CU-303 (8-9 Nov)
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree
`~/dtadpole/computer-use-wt/<session id>` (D-080). The install, held-run and lock scripts live in the seat's private
member folder `tools/`, and they re-check owner idle right before every hold.

## Live state

- Installed helper: 0.2.58 from main aca5a2a (8 Nov 23:37Z). Read-back was OK, sha256 0c7d9f2f, self-test 40 checks.
  It carries 0.2.57 (CU-227).
- The local config's `helperCheckouts` names the main checkout and the worktrees folder. Proof: a worktree and an old
  seat path were admitted; two unlisted folders were refused.

## In flight

- #165 (CU-252's Finder-shaped stand-in). Probe 5 showed that AppKit serves an NSTableCellView's label across
  processes but not its AXFilename or AXURL. Once the cell's text field carries them, the selection read gets its
  kind. Head 8bd667e keeps the AXCell role; probe 6 read file, file and folder, and Command-O on a script or an app
  asked launch_code. Ready; it waits for cu-verifier's review.
- #182 (helper 0.2.59, Fixes CU-303). A dry-run or simulated start no longer asks TCC. A test burst of such starts
  had run tccd out of file descriptors (EMFILE), and the next live start read every grant false. Next: cu-verifier's
  OK, landing, then an install.

## Issues

Verify: CU-203 (the owner in person, step 4), CU-227, CU-262 (waits on #165), CU-295. In Progress: CU-303.

## Rules learned

- Re-check owner idle right before a hold, not only before waiting for the lock.
- When grants read all false for a moment, read tccd in the unified log first.
- Check Accessibility shapes across processes through the helper; an in-process read can differ.
