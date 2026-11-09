---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-08T23:10:00Z
level: L2
version: 3.0.0
description: 'What the successor [cu] Integrator needs to take over the landing lane of dtadpole/computer-use mid-flight, at the 8 Nov evening re-home.'
status: unverified
grounded_in:
  - source: 'owner order 2026-11-08 14:59 PST via cu-coordinator 23:04Z (main checkout moved; one successor per seat)'
  - source: 'decisions D-073, D-076, D-078 (node-only and records-only landings) and CU-276 (run-lock waiter)'
---

# [cu] Integrator - handover

**Goal.** Land every reviewed [cu] PR on dtadpole/computer-use with `pr-merge.py` after the public-hygiene gate
and the two-phase gate, with merge-tree equality; Urgent and consent-row fixes first, in cu-coordinator's order.

**Live state (23:10Z).** About 130 PRs landed today, all tree matches. Order given: #141 (gating), #150, #146 and
#149, #157, #152, then the records (#156, #154, #158) and the backlog. #150 (helper 0.2.58): helper checks passed on
test merge b795460b5; GitHub reports a conflict from two merge bases - its author merges main, and the waiter lands
it if the merged helper tree equals the checked one, else re-runs the chain. #146 holds: its change left the
desktop-consent mutant `terminal-typed` stale. #132 waits for a main merge. Table PRs need OKs at their heads.

**Machinery** (`/tmp/cu-integrator-*`, gone on a reboot): `land-cu.sh` (hygiene twice, mutex, carries check, the
D-076/D-078 records path), `land-next.sh`, `land-seq.sh`, `land-when-reviewed.sh`, `chain-helper.sh` (`CHECKS_ONLY=1`,
`SKIP_SWIFT=1`), `chain-mut.sh`, `suite.sh` (registers the CU-276 waiter), `general.sh`, `watch.sh`, `reviewed.py`,
`record-all.sh`, `partial-check.py`. Priority tickets queue oldest-first in `/tmp/cu-integrator-tickets/`.

**Rules that bit.** List PRs with `--limit 200` (the default 30 hid the oldest). `grep -v` that empties a file
exits 1 - add `|| true`. Two merge bases: local merge-tree clean, GitHub conflicting - the author merges main.
Quoted words and hold-like lines followed by the same sender's OK are not holds. A closure-sweep 'To Verify' note
is deliberate. Lands mark inbox messages read: read the saved `inbox-before-merge-*` files.

**Paths.** The main checkout is now `~/dtadpole/computer-use` (old paths are symlinks); this seat's worktree stays
`~/computer-use--cu-integrator` until the successor re-homes.
