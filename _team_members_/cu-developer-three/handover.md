---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-09T02:20:00Z
level: L1
version: 1.6.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator landing plan 2026-11-09 01:50Z (one install of 0.2.61 after the helper chain lands)
  - source: Linear CU-252, CU-299, CU-303, CU-321, CU-322 (9 Nov)
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree
`~/dtadpole/computer-use-wt/<session id>` (D-080). The install, held-run and lock scripts live in the seat's private
`tools/`; `install-held.sh <version> --prove` re-checks owner idle right before its hold.

## Live state

- Installed helper: 0.2.58 (8 Nov 23:37Z, sha256 0c7d9f2f). The local config's `helperCheckouts` names the main
  checkout and the worktrees folder.
- #165 landed (add66af): CU-252's stand-in reads names and kinds; CU-259 and CU-262 are verified.

## Helper chain (all OK'd, in cu-integrator's code lane)

Land order: #182 (0.2.59, CU-303) -> #199 (boundary verifier) -> #192 (0.2.60, CU-299) -> #206 (0.2.61, CU-322).

- #182: dry-run and simulated starts ask TCC nothing (a test burst ran tccd out of descriptors).
- #192: only configured checkouts are admitted, and the config must be this user's alone. Design #191 landed.
- #206: hitTest and focused report `inWebArea` (true, false, or null for a walk that could not finish).
- Then ONE install of 0.2.61 with `--prove`: the session worktree admitted; a throwaway `~/computer-use--probe`,
  an unlisted folder and `/tmp` refused. First check that cu-integrator's nightly passes `--worktree-root` (#201).

## Issues

In Progress: CU-322 (High), CU-303. Todo: CU-299 (released for the WIP limit, until the install). Next: CU-321
(does setting AXManualAccessibility expose Chrome's web tree? The helper already sets it in `exposeTree`). Verify:
CU-203 (the owner in person).

## Rules learned

- Re-check owner idle right before a hold.
- When grants read all false for a moment, read tccd in the unified log first.
- Check Accessibility shapes across processes through the helper; an in-process read can differ.
