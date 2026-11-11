---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-10T22:05:00Z
level: L2
version: 5.0.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use mid-flight, at the 10 Nov evening.'
status: unverified
grounded_in:
  - source: 'cu-coordinator goal of 2026-11-10 20:00Z (High lane under D-108, rule 2, records between Highs)'
  - source: 'decisions D-079, D-085, D-086, D-090, D-093, D-095, D-097, D-100, D-105, D-108'
---

# [cu] Integrator - handover

**Goal.** Land every reviewed PR at its exact head through the hygiene gate and the two-phase gate (merge-tree
equality, `pr-merge.py --expect-sha`). Under D-108: Highs one `policy.mjs` PR at a time, each with two signed
PR-comment OKs and a main merge right before its slot; rule 2 holds Medium `policy.mjs` PRs while a High with an OK
is open; non-policy PRs and records fill the gaps.

**Live state (22:05Z).** Twenty-one Highs closed live today; the phrase grammar (#554) is on main. High lane: #575
(table PR 2) after cu-developer-two's live rows, #576 (dial-row unit, round 2), #580 (table PR 3, round 2). Filler:
#345 waits for owner idle, then #368, #371, #436. Held under rule 2: #447 #448 #462 #469 #477 #478 #417 #411 #360
#343 #497 #501 #523 #527 #547.

**Machinery** (`/tmp/cu-integrator-*`, gone on a reboot): `land-together.sh` (wait-until-ready slots, joint check
and readiness at the turn), `land-cu.sh`, `queue-cu.sh`, `chain-lib.sh`, `records-next.sh` (FIFO), `reviewed.py`
(signed PR comments; a message older than the PR is ignored), `both-ok.sh`, `audit.sh`, `selfcheck.sh`, `holds-lib.sh`.

**Lessons.** Move a cached run aside before a flake re-run. Trust GitHub's mergeable only once main has been still
for two minutes, and keep the tickets while waiting. Check that a High's ticket exists before pre-empting for it.
Pre-empting a filler already in phase 2 gains nothing while the High still needs its phase 1. Audit re-queues land
at the tail; move their tickets back to the old slot.
