---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-16T19:15:00Z
level: L1
version: 1.18.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: hd-coordinator's goal renewal of 2026-11-16 05:10 PST (Linear items by priority, CUHelper correct, land through cu-integrator)
  - source: PRs #889, #893, #895 (CU-586 / CU-588); CU-586 live row 20261116T140804Z-938cc3; #894 live second 16 Nov 18:24Z
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree (D-080).

## Live state

- Installed helper: 0.2.70, the same as main's helper source.
- Hold wrapper: `heldrow.sh` with ROW= and PURPOSE= (sets `CU_DESKTOP_SEAT`, CU-305).
- Row scripts:
  - `row586.mjs`: fixture sheet (#893);
  - `row588.mjs`: placeholder-only 'Type DELETE' beside 'Confirm'.
- All of the above are kept in a git-excluded `.cu3-tools/` folder.

## Linear

- **CU-372 and CU-387: Done.**
- **CU-586: In Progress, PR #889** (helper 0.2.71).
  - It has one OK.
  - It removes one over-ask, so it waits for cu-coordinator's D-108 ruling (CU-429 precedent).
  - Reproduced live on 0.2.70.
- **CU-588: In Progress, PR #895** (helper 0.2.72: formEntries).
  - It has both OKs and is stacked on #889.
  - Its ask needs #894.
- **Close sequence:** install with READBACK, then the after-rows (row586 / row588).
- **CU-589:** in Triage. The helper lends form options only to a lone button.

## Duties

- Corpus diffs (`lost-asks2.mjs`) and fresh held-outs on table PRs.
- Each held-out is written before the round and measured once.
- Live seconds through `_tools_/live-rows/sweep.mjs`.

## Rules learned

- Fetch PR heads into named refs.
- Bare issue ids in PR titles move issues (Linear's GitHub integration).
- Commit with the configured identity only.
- In live-row forms, avoid email / phone fields: typing there asks first.
