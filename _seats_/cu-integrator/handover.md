---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-11T22:05:00Z
level: L2
version: 6.0.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use mid-flight, at the 11 Nov evening.'
status: unverified
grounded_in:
  - source: 'cu-coordinator goal of 2026-11-11 13:05Z (High lane, fillers, nightly CU-59, keep-closed watch)'
  - source: 'decisions D-079, D-085, D-090, D-093, D-095, D-097, D-101, D-108'
---

# [cu] Integrator - handover

**Goal.** Land every reviewed PR at its exact head through the hygiene gate and the two-phase gate (merge-tree
equality, `pr-merge.py --expect-sha`); phase 2 only with the owner idle >= 300 s. Highs go one at a time in the
coordinator's lane order, each with two signed PR-comment OKs; the first High ready takes the slot and no High
pre-empts another; fillers yield to Highs and to live-row runs.

**Live state (22:05Z).** Since 13:05Z: table PRs 23-31, the CU-429 lowering, CU-433 and CU-507's web and dialog
halves landed; the nightly CU-59 run on main was GREEN with phase 2. Lane: #737 (helper 0.2.70: helper chain in
checks-only mode, then its gate and an idle-checked install) -> #739 -> CU-507 read-only row -> #746 -> #747 -> #735
(CU-429 round 2) -> #734 (CU-522). Fillers: #624, #621, #500, #491, #742 (CU-462).

**Machinery** (`/tmp/cu-integrator-*`, gone on a reboot): `land-together.sh`, `land-cu.sh`, `queue-cu.sh`,
`chain-helper.sh` (`CHECKS_ONLY=1` for build, selftest and prove-failing), `records-next.sh`, `reviewed.py` (D-085
carries), `both-ok.sh`, `selfcheck.sh` (audit and base-first sweep), `base-sweep-loop.sh` (every 60 s),
`premerge-snap.py` with `record-cu.sh` (restore what link automation closed, a 20-minute keep-closed watch, every
merge answer copied to cu-verifier) and a move log of every Linear state change.

**Lessons.** Lift a base-first hold the minute its PR is retargeted (one High sat 22 minutes). Take every
'Fixes CU-n' in a title, not the last. Check that a slot number is unused before arming it. Read a HOLD's failing
test before calling it environmental. Announce a desktop hold as waiting for idle until it is actually taken.
