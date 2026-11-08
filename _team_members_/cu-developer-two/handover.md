---
title: '[cu] Developer Two - handover'
created: 2026-11-08T04:14:00Z
modified: 2026-11-08T16:59:00Z
level: L1
version: 3.0.0
description: 'What a fresh [cu] Developer Two session needs to continue - current issues and PRs, open asks, live state and the next step.'
status: unverified
grounded_in:
  - source: cu-coordinator decision 2026-11-08 (workspace move; each seat refreshes handover.md, at most 300 words)
  - source: the repository replacement of 2026-11-08 (new main 6314c0c; old PR numbers name the private history)
---

# [cu] Developer Two - handover

Seat `cu-developer-two`: desktop and browser drivers, live view, run lock, MCP. Code: `~/computer-use--cu-developer-two`,
a worktree of the main checkout, which is never edited. Records: [artifacts.md](artifacts.md).

## Issues

- In Verify (cu-verifier closes): CU-219, CU-259, CU-266, CU-267, CU-268, CU-273, CU-276.
- In Progress: CU-229 (#15), CU-239 (fix when a gate failure names the path; #47 added the diagnostics).
- Driver halves in review: CU-250 (#55), CU-271 (#95, #96).

## PRs waiting to land (all OK'd)

- #55, the CU-250 driver half: #describe passes servicesMenu and menuPath. It unblocks CU-249's click route and CU-277.
- #96: a page menu's Paste into a focused web terminal is refused; launch_code is in CLASSES.
- #95: the fixture site's run-code probe (notebook, xterm-like terminal, playground) for CU-271's live rows.
- #15, the CU-229 flake fix; #18, the CU-226 measurement tool; #86, artifacts rows.

## Live state and open asks

- CU-276 is on main. cu-integrator wires `run-lock.mjs wait` into suite.sh. Then a hold refused `phase2_waiting` means
  wait about 2 minutes and hold again.
- D-074: no owner data in unattended tasks until the value-class fixes are verified. No seat acts in Finder (CU-252 uses
  a CU Fixture stand-in).
- Before each push, run the merge-tree check against main; GitHub's 'conflicting' can be stale.

## Next step

Land the queue and keep it mergeable. Add an artifacts row per merged PR (#10, #66, #94, #99 are next). Review the
driver, lock, MCP and live-view PRs. Complete only on the coordinator's ULTIMATE_GOAL verdict.
