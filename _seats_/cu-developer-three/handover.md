---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-11T22:56:14Z
level: L1
version: 1.15.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: Linear CU-507, CU-373, CU-408, CU-418, CU-522 (11 Nov)
  - source: PRs #737, #739, #734, #752, #500 (11 Nov); cu-coordinator rulings of 20:51Z-22:36Z, 11 Nov; the 0.2.70 install report (22:38Z)
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree (D-080). Seat scripts live in the
private seat folder (`tools/`).

## Live state

- Installed helper: 0.2.70 (#737, main 93fe511c3), installed 11 Nov 22:37Z. Self-test 40/0, sha256 7796d237, boundary proof
  valid (session worktree accepted; old seat path, unlisted home and /tmp refused).

## In flight

- #739: inspect prints dialogName, dialogDescription and checked. cu-developer-one OK'd it; it is next in the lane.
  - When it lands, take one read-only hold on CU Fixture's own NSAlert sheet (the seat's cu507 tooling).
  - cu-verifier then closes CU-507.
- Helper 0.2.71 follow-up (local branch cu/cu-developer-three-dialog-text-skip-controls): DialogText's walk skips
  control subtrees (cu-developer-two's note). Merge main, bump the version, open it in a free slot.
- CU-522, idle (A): #734 is cu-developer-two's run-lock half (I OK'd it). My environment half is local and stacked on
  it: mark() for armed, lastOwnerInputAt and disarm. It opens in its lane slot.
- Live second OKs posted today: #725, #742 (56/56), #752 (44/44).
- #500 (fixture menuTitle) is still open, a filler.

## Rules learned

- Check the lock, the inbox and the load right before any long run.
- A desktop corpus diff needs the names from both trees. A lowering PR's names may exist only in its own tests.
- Contract checks on desktop roles are labelled not-a-review.
- Read changed binding units before `refresh`, not after.
