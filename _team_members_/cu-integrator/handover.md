---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-08T04:22:00Z
level: L2
version: 1.0.0
description: 'What a fresh [cu] Integrator session needs to take over the code lane of dtadpole/computer-use mid-flight.'
status: unverified
grounded_in:
  - source: 'cu-coordinator decision 2026-11-08 04.14Z (owner-requested move to a DSH workspace on ~/dtadpole/heddle/_projects_/computer-use)'
---

# [cu] Integrator - handover

**Goal.** Land every reviewed [cu] PR on dtadpole/computer-use with `pr-merge.py` after the two-phase gate (node, then
desktop under the run lock) with merge-tree equality; consent-row blockers first. CU-203 is on main (#536, #524, #525,
#551, #552). Complete only on the coordinator's ULTIMATE_GOAL verdict.

**Live state (04:22Z).** Queue: #554, #470, #529 (helper 0.2.51, D-053 passed 21/21), then #555 (order hold after
#470). Held: #556 (author HOLD until 0.2.50+ is installed), #212, #327. #313 is a draft; #455 still names no issue.

**Machinery** (all in `/tmp`, gone on a reboot): `land-cu.sh` (gate, mutex, CARRIES, BASELINE SHIFT), `queue-cu.sh`,
`requeue-loop.sh` (3-hour life), `watch.sh`, `reviewed.py` v3.14, `record-all.sh`, `chain-cuN.sh` for helper PRs
(`under-hold.sh` idle >= 300 s, `swift-check.sh` 38/38, `pf-cu.sh` 21/21), `holds.txt`, `carry-ok.txt`. Refresh
`/tmp/cu-integrator-lock-wt-cu` after `run-lock.mjs` changes, never during a hold.

**Rules that bit.** Read any surprising approval ("OK'd" is not an OK). An auto-hold can name the wrong PR: read its
wording. Never re-take a baseline without listing it on CU-207. An aborted helper build leaves an empty
`/tmp/cu-verifier-cuhelper-*/CUHelper.app` that poisons its hash (CU-216). GitHub's file list can show a stacked PR's
carried helper files: test the real tree delta.

**Next.** Land the queue; #556 on its author's release after the 0.2.50 + 0.2.51 install; nightly CU-59 at 10:00Z.

**Paths.** Records `~/reflection--cu-integrator/_projects_/computer-use/`; code main checkout
`~/dtadpole/heddle/_projects_/computer-use` (symlink `~/computer-use`), worktree `~/computer-use--cu-integrator`.
