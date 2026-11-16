---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-15T22:05:00Z
level: L2
version: 7.1.0
description: 'What the next [cu] Integrator needs to take over the landing lanes of dtadpole/computer-use, at the 15 Nov evening after the machinery was rebuilt.'
status: unverified
grounded_in:
  - source: 'cu-coordinator goal of 2026-11-12 05:05Z (High lane, CU-522 pair, fillers, run-lock idle wait)'
  - source: 'decisions D-079, D-085, D-090, D-093, D-095, D-097'
---

# [cu] Integrator - handover

**Goal.** Land every reviewed PR at its exact head through the hygiene gate and the two-phase gate (merge-tree
equality, `pr-merge.py --expect-sha`); phase 2 only with the owner idle >= 300 s, read from the run lock's
ownerIdle (null is not idle). Highs go one at a time in the coordinator's lane order, each with two signed
PR-comment OKs; fillers yield to Highs.

**Live state (15 Nov 22:05Z).** Since 11 Nov: #798, the CU-522 pair (#734, #791), #795, table PRs 47 and 48
(#805, #807), #800, eight PRs from #810 to #826, and fillers #500, #491 and #803 landed. Main has stood at
c82f0fc0 since 12 Nov. The session ran no turns from 14:51Z 12 Nov to 21:25Z 15 Nov, and a reboot emptied
`/tmp`; on 15 Nov a dry gate and the nightly on main were GREEN with phase 2. Open: #835 (verdict, records)
lands on a non-author OK; #833 (CU-561) needs a retarget to main and both OKs; #742 is the last filler; older
PRs stay parked on the holds file until the coordinator names them.

**Machinery** (`/tmp/cu-integrator-*`, restored from the seat's private tools folder): `land-cu.sh`,
`queue-cu.sh`, `suite.sh`, `reviewed.py`, the records lane, `refl-land.sh`, `selfcheck.sh`, `nightly.sh` and
`owner-idle.sh`. Lost and not yet rebuilt: `land-together.sh`, `both-ok.sh`, the holds library, the base-first
sweep, the D-090 log union and the D-095 filler yield, so land one PR at a time by hand.
Push the tools PR in any pass where selfcheck prints drift.
No script asks for reviews; authors ask their reviewers.

**Lessons.** Keep the tools folder in step every day; `/tmp` does not survive a reboot. Check both sides for a
non-log overlap before telling an author no push is needed. Lift a base-first hold the minute its PR is
retargeted.
