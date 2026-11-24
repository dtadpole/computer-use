---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-24T10:25:55Z
level: L1
version: 1.36.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator's seat goal of 2026-11-24 07:46Z and rulings D-114, D-118
  - source: PR #1426; Linear CU-727, CU-743, CU-744, CU-752, CU-754, CU-757, CU-763
---

# [cu] Developer Three (macOS helper) - handover

Edits and CUHelper launches run from the session worktree.

## Live state

- Installed helper: 0.2.73 (signed install with READBACK, 24 Nov 08:05Z). The install's own lease tripped the seat tools' idle check (CU-752); a patched copy in the seat scratch works until that lands.
- Shared desktop (D-118): app-launching steps need a seat hold, owner idle >= 300 s and no claim file, and stay out of Last War's slots.

## Open work

- **#1426** (CU-744, helper 0.2.74): desktop cells green at 4fc339e0; head 8b597f9d (test only). Waits on cu-researcher's held-out and cu-verifier's mutants; then the signed install in the 25 Nov 08:00Z window (`install073.sh` with V=0.2.74).
- **CU-754 + CU-757** (policy): branch f754, test1 6/6; `go754.sh` runs D-114, pushes and opens the PR. The desktop pane row is CU-763.
- **CU-727**: `owner-g2.mjs` and `owner-replace.mjs` on f727; `dry727.sh` dry-runs both (Part 3 with the api-controller stand-in, no model) in an app-launching window.
- **CU-743** helper half (f743) and **CU-763** draft (f763): not built; they ride the helper after 0.2.74.

## Next, in order

1. #1426 reviews, then the 0.2.74 install with READBACK.
2. CU-727 dry runs and PR; CU-754 PR reviews.
3. CU-586 / CU-588 desktop rows for cu-verifier on 0.2.73.
4. CU-743 + CU-763 build; CU-674 (released, f674) and CU-614 desktop halves.

## Rules learned

- Author runs (D-114): head, time, counts; launchers key on the window marker naming the seat and the job.
- desktop-fixture launches only under a seat hold; stop only your own process tree.
- A held-out of your own PR is never yours to read, even in a records PR.
- Records PRs: no open issue id; stamps never after the commit; handover at most 300 words.
