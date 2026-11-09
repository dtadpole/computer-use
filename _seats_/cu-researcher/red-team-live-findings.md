---
title: Red team live findings after the grant
created: 2026-11-05T14:32:56Z
modified: 2026-11-09T13:47:48Z
level: L1
version: 2.1.1
description: Findings the red team raised or confirmed on live desktop runs after the owner's grant, with owners and the retest that closes each.
status: unverified
grounded_in:
  - source: _seats_/cu-researcher/red-team-retest-2.md
  - source: 'cu-verifier runbook step 5 and its impersonation probe on CUHelper 0.2.10, 2026-11-05 (inbox 20261105T142726 and 143150)'
---

# Red team live findings

Both findings below are **withdrawn** (D-038): they came from the test setup, not the helper.

| ID | Finding | Status |
|---|---|---|
| L1 | Out-of-scope CU Ledger in captures 2 and 3 of runbook step 5 | withdrawn: CU Ledger was in the owner's always store, so agent core added it to the scope at the first wait (loop.mjs lines 497 to 506) |
| L2 | A click on CU Ledger delivered | withdrawn: same cause; with a private store holding only CU Fixture, the refined probes asked new_app, declined, and nothing reached CU Ledger (cu-verifier, helper 0.2.10) |

My prediction of an impersonation hole rested on the same wrong premise. What stays: helper 0.2.12 takes the
window owner from WindowServer through AppKit as defence in depth (design 0.4.8), and every probe now uses a private
store holding only the apps it means to approve. My offline review of that owner rule follows.

## CU-14: the owner rule against overlays (live, 2026-11-05)

On dtadpole/computer-use main 1eaabfa with helper 0.2.14, CU Ledger unapproved (a private store copying only CU
Fixture's tty record), one scripted click on CU Fixture's Create per probe:

| Probe | Result |
|---|---|
| no overlay (control) | allowed, landed on Create |
| CU Ledger overlay at alpha 0.01, normal level | target named CU Ledger, new_app asked and declined; CU Ledger got no click |
| the same at floating level, alpha 1 | the same |
| overlay appearing 0 or 2 ms after a trigger | already up at the decision: declined |
| overlay appearing 20 ms after the trigger | allowed on CU Fixture, then the post refused out_of_scope; no click reached either app |

Transparent, floating and late windows hold. The indicator case is covered by cu-verifier's boundary verifier. A
sub-millisecond race between the helper's last owner read and the post stays theoretical.

## Read next

[red-team-retest-2](red-team-retest-2.md).
