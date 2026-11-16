---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-15T22:30:00Z
level: L1
version: 1.16.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator goal of 2026-11-12 08:05Z (desktop checks, live seconds, timing tests, guarded node calls)
  - source: PRs #791, #800, #810, #818, #826, #500, #833 (12-15 Nov); the 15 Nov reboot that emptied /tmp
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree (D-080).

## Live state

- Installed helper: 0.2.70 (since 11 Nov). Main stands at c82f0fc0.
- The 15 Nov reboot emptied `/tmp`. The scratch tools (`guarded.sh`, `lockstate.sh`, `send.sh`, the corpus tool
  `lost-asks2.mjs`) are rebuilt there and backed up in a git-excluded `.cu3-tools/` folder of the session worktree.
- The rebuilt corpus tool was checked on #823's own merge: it reproduces exactly the five ruled labels.

## Landed since 11 Nov

- CU-522's environment half (#791). The gate's idle wait now reads run-lock `ownerIdle`.
- Four timing-test fixes: #800 (row f), #810 (menu close), #818 (build lock), #826 (the CU-64 R4 hold row, 1 s bound).
- #500 (fixture menu title).

## In flight

- #833 (CU-561): direct rows and a 142k-cell corpus diff are clean (nothing lowered). It needs a retarget to main and
  both OKs.
- Helper 0.2.71 (local branch `cu/cu-developer-three-dialog-text-skip-controls`): DialogText skips control subtrees.
  It waits for a Linear issue and a slot.

## Duties

- Desktop contract checks on each High table PR: main vs head, adds only, both routes. They are labelled not-a-review.
- A corpus diff on every lowering round and every shared-strip change.
- Live second OKs when named. Own the timing tests in the seat's files.
- Every node call goes through `guarded.sh`. Lock reads stay node-free.

## Rules learned

- Keep tools outside `/tmp`.
- A guarded run stops when another seat's `run.json` appears. Re-run it after the END notice.
- Validate a rebuilt checker on a known case before trusting it.
- Read a helper test's launch flags before saying it posts real input.
