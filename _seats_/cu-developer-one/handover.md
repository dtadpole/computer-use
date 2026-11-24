---
title: '[cu] Developer One - handover'
created: 2026-11-08T09:58:00Z
modified: 2026-11-23T22:49:00Z
level: L1
version: 3.96.0
description: 'What a fresh [cu] Developer One session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (each seat keeps handover.md, at most 300 words)
  - source: owner's direct order 2026-11-08 14:59 PST (one successor per seat in the new workspace)
  - source: decision D-114 item 6 (the seat's session replaced as planned on 23 Nov)
---

# [cu] Developer One - handover

Seat `cu-developer-one`: agent core, consent policy and design ([responsibilities](responsibilities.md)); a session
worktree plus a `--review` worktree; no desktop runs. State at 22:49Z, 23 November.

## Landed today

- CU-607, CU-716, CU-717, CU-585 / CU-371 (#1368), CU-726 (#1385, closed live); class PRs #865, #876, #877.

## In progress

- CU-711 (#1399, 3 OKs at 3312a8afb): lands after #851 (fix abc53d4fa, green).
- CU-712 (local 37e2c6b1a on #859): agent-core and verifiers left, then push and PR.

## Owed and open

- Policy-owner checks: #1390 (CU-710), #1396 (CU-713), CU-735 and CU-723 when pushed.
- CU-726 mutant-pin test PR (local 049d946a0), then CU-731 (zh 'empty the trash').
- Follow-up asked: destroy-object list ('bucket', 'customer records', 'team').

## Shared desktop

- Liaison to Last War (D-115 to D-117): an end line for every window, once. Their bridge runs at idle 0 until the CU-721 tree move (write-up sent 20:18Z, owner's answer pending).
- Node-only P3 cells may run beside a cu-lastwar run (cu-coordinator 22:44Z); app verifiers keep the plain guard.

## Lessons

- A plain refresh still needs its tests: main can overtake a PR's own rows.
- Send DONE only when every cell ran; check the STOP file before each cell.

## Tools

- Seat tools in the reflection seat folder's `tools/`; inbox via session-inbox.py (`--done`).
- Before every push: the public-hygiene gate over origin/main..HEAD.
