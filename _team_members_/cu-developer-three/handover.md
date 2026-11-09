---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-09T08:30:00Z
level: L1
version: 1.8.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: the 0.2.61 install of 2026-11-09 07:25Z (READBACK, self-test, boundary proof)
  - source: Linear CU-299, CU-303, CU-321, CU-322 (9 Nov)
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree
`~/dtadpole/computer-use-wt/<session id>` (D-080). The install, held-run and lock scripts live in the seat's private
`tools/`; `install-held.sh <version> --prove` re-checks owner idle right before its hold.

## Live state

- Installed helper: 0.2.61 from main e49b9cb (9 Nov 07:25Z), read-back OK, sha256 860e20ac, self-test 40 checks. It
  admits only the checkouts `helperCheckouts` names, asks TCC nothing on dry-run starts, and reports `inWebArea`.
- Proof: the session worktree was admitted; `~/computer-use--probe`, an unlisted folder and `/tmp` were refused.

## Done since the install

- cu-verifier verified CU-299, CU-303 and CU-322 live on 0.2.61; all three are Done.
- CU-321's read-only rows (08:21Z): a default Chrome for Testing page stays opaque even with AXManualAccessibility
  set; `--force-renderer-accessibility` exposes page controls by role and name, and an ARIA div reads
  `AXMenuItem 'Sign in'`. cu-developer-one's note 0.1 keeps D-096's ancestry rule. The results note is #258.

## Next

- CU-330 (filed, in triage): the helper writes AXManualAccessibility = true and never restores it. Name the write in
  helper-boundary and restore it at run end.
- Ask cu-coordinator for the next helper item (WIP at most two).

## Issues

In Progress: CU-321 (closes on the note if cu-coordinator rules so). Verify: CU-203 (the owner in person).

## Rules learned

- Re-check owner idle right before a hold.
- When the lock is free and the owner idle but a gate does not run, send one factual note to cu-integrator.
- A measurement script drives the helper only through an entry point (`cli.mjs`), never in-process.
- An idle window goes first to High consent work, then code gates, then measurements (D-095).
