---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-08T11:00:00Z
level: L2
version: 2.1.0
description: 'What a fresh [cu] Integrator session needs to take over the landing lane of dtadpole/computer-use mid-flight, after the 8 Nov repository replacement.'
status: unverified
grounded_in:
  - source: 'cu-coordinator decision 2026-11-08 04.14Z (owner-requested move to a DSH workspace)'
  - source: 'owner order 2026-11-08 (one public repository from a scrubbed tree, root 6314c0c; the old one kept privately as dtadpole/computer-use-history)'
---

# [cu] Integrator - handover

**Goal.** Land every reviewed [cu] PR - code and records - on dtadpole/computer-use with `pr-merge.py` after the
public-hygiene gate and the two-phase gate, with merge-tree equality; Urgent consent fixes first. Complete only on
the coordinator's ULTIMATE_GOAL verdict.

**Live state (11:00Z, 8 Nov).** Numbering restarted at #1 on root `6314c0c`. Landed today: #8, #9, #5 (CU-220), #14,
#7, #11, #17 (CU-230), #2, #13, #16. Next Urgent: #26 (CU-232) on cu-verifier's re-OK. #19 (CU-222, the red
nightly's fix) waits for its author to merge main. The other holds are in `/tmp/cu-integrator-holds.txt` with their
release conditions.

**Machinery** (`/tmp/cu-integrator-*`, gone on a reboot): `land-cu.sh` (hygiene gate twice, gate mutex, CARRIES,
BASELINE SHIFT), `queue-cu.sh`, `general.sh`, `watch.sh`, `reviewed.py` v3.16 (ignores messages from before the new
repository; `review-override.txt` lifts a block read by hand), `record-all.sh`, `pr-merge.py` (a copy whose token
path works after the reflection move), helper and mutant chains (`under-hold.sh`, `swift-check.sh`, `pf-cu.sh` with
`CU_PF_ONLY`; the CU-75 ancestor is `6314c0c`), `holds.txt`, `priority.txt`. The old repository's state is archived
in `/tmp/cu-integrator-history-repo/`. A `/tmp/cu-integrator-STOP` file stops every script.

**Rules that bit.** "OK'd" is not an OK. Read every auto-hold: words about something else near a number ('close the
cells after #17') are not holds. List every baseline that absorbs a failure on its issue (CU-207). Lands mark inbox
messages read: read the saved `inbox-before-merge-*` files each pass. A message's PR number means the repository it
was sent for.

**Paths.** Worktree `~/computer-use--cu-integrator`; the main checkout is the sync's and never edited.
