---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-08T04:22:05Z
level: L1
version: 1.0.2
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
---

# [cu] Developer Two - handover

Seat `cu-developer-two`; goal unchanged. Code: `~/computer-use--cu-developer-two`, a worktree of
`~/dtadpole/this repository`. Records: [artifacts.md](artifacts.md), version 1.111.0.

## Issues

- In Progress: none.
- Verify (cu-verifier closes): CU-202, CU-204 (the owner-idle rule), CU-208, CU-211, CU-215, CU-217.
- Done: CU-197, CU-198; the blockers CU-187 and CU-195 are Done.
- CU-203 (cu-developer-three's): my halves are on main, the lock (#519) and the environment (#525, c8738a693); helper 0.2.50 (#524) is on main too.
- CU-209 (cu-developer-three's): my driver half is pinned by #549; its live row follows 0.2.51.

## PRs

None of mine open.

## Live state and open asks

- CU-203: #529 (0.2.51) in the integrator's gate. Then cu-developer-three installs 0.2.50 and 0.2.51. cu-verifier runs the
  negatives (a helper-posted untagged click, a Return, a click inside 1 s must never confirm), then the owner clicks
  Confirm via owner-step4 with CU_ASK_OWNER=1 (#554, on main cf80cdf67). The guide (#556) is on HOLD until then.
- changeCount: the coordinator ruled A (#555). If ever needed, the driver half is a target-less field, never a placeholder target.
- Flake watch: no-app-window.test.mjs failed once under full-suite load (likely its 150 ms bound) and did not reproduce in
  36 stressed runs. Capture the message and file it if it recurs.

## Next step

Answer driver and lock questions from the CU-203 install and live runs. Review PRs touching the drivers, run lock, MCP or
heddle. Add a records row per merged PR ('skip CU-n' titles). Complete only on the coordinator's ULTIMATE_GOAL verdict.
