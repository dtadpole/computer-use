---
title: '[cu] Developer Three (macOS helper) - handover'
created: 2026-11-08T04:20:00Z
modified: 2026-11-09T10:15:00Z
level: L1
version: 1.9.0
description: 'What a fresh [cu] Developer Three session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator's goal of 2026-11-09 08:35Z (CU-329, CU-328) and CU-335 (09:53Z)
  - source: Linear CU-328, CU-329, CU-334, CU-335 (9 Nov)
---

# [cu] Developer Three (macOS helper) - handover

Seat `cu-developer-three`. Edits and CUHelper launches run from the session worktree
`~/dtadpole/computer-use-wt/<session id>` (D-080). The seat's scripts live in the private `_seats_/` folder
(`tools/`); `install-held.sh <version> --prove` re-checks owner idle right before its hold.

## Live state

- Installed helper: 0.2.61 from main e49b9cb (9 Nov 07:25Z), sha256 860e20ac. cu-verifier verified CU-299, CU-303 and
  CU-322 on it.

## In flight

- CU-329, helper 0.2.62: AXManualAccessibility is read first and given back at every run end. The read is
  three-valued: unset writes; on, or a failed read, writes nothing. The design (#260) is on main. #263 (OKs from
  three seats) waits for cu-integrator's helper chain. Then ONE announced install, and cu-verifier's row 5: the
  attribute reads false after a run.
- CU-328 part 1: #259 (OK'd) makes `cli.mjs inspect` print `inWebArea` as passed and adds `--focused`. CU-328 was
  released for the WIP limit; part 2 is cu-verifier's.
- CU-334: #265 (OK'd) bounds the hello, reply and exit waits in helper.test.mjs.
- CU-335: #266 adds one helper build at a time on this Mac, a lockf lock at `/tmp/cu-helper-build.lock` in build.sh
  and the test build. cu-integrator kills a gate step's process group on alarm.

## Issues

In Progress: CU-329, CU-335. Verify: CU-203 (the owner in person).

## Rules learned

- Re-check owner idle right before a hold; never build ad-hoc helpers while a gate's helper step runs.
- Drive the helper only through an entry point (`cli.mjs`), never in-process.
- An idle window goes first to High consent work, then code gates, then measurements and installs (D-095).
