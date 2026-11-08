---
title: '[cu] Integrator - handover'
created: 2026-11-08T04:22:00Z
modified: 2026-11-08T10:00:00Z
level: L2
version: 2.0.0
description: 'What a fresh [cu] Integrator session needs to take over the landing lane of dtadpole/computer-use mid-flight, after the 8 Nov repository replacement.'
status: unverified
grounded_in:
  - source: 'cu-coordinator decision 2026-11-08 04.14Z (owner-requested move to a DSH workspace)'
  - source: 'owner order 2026-11-08 (one public repository from a scrubbed tree, root 6314c0c; the old one kept privately as dtadpole/computer-use-history)'
---

# [cu] Integrator - handover

**Goal.** Land every reviewed [cu] PR - code and records - on dtadpole/computer-use with `pr-merge.py` after the
public-hygiene gate and the two-phase gate (node, then desktop under the run lock) with merge-tree equality;
consent-row blockers first. Complete only on the coordinator's ULTIMATE_GOAL verdict.

**Live state (10:00Z, 8 Nov).** The repository restarted at root `6314c0c`; PR numbers restart at #1. The old
repository's open PRs are re-opened by their authors as new branches, and old numbers are dead. Orders carried:
#6 (guide `--ask-owner`, Part of CU-203; old #556) waits for cu-verifier's release (helper 0.2.51 is installed); #5
(CU-220; old #555) is the rule-only diff, since the verifier fix is on main, and lands on three OKs at its head, before
cu-verifier's no-count check; #1 (CU-135, the export-overwrite task; old #313) lands on review. Old #327 had already
landed.

**Machinery** (all in `/tmp`, gone on a reboot): `cu-integrator-land-cu.sh` (hygiene gate twice, gate mutex,
CARRIES, BASELINE SHIFT), `-queue-cu.sh`, `-general.sh`, `-watch.sh`, `-requeue-loop.sh` (3-hour life),
`-reviewed.py` v3.15 (ignores messages from before the new repository), `-record-all.sh`, chains for helper PRs
(`-under-hold.sh` idle >= 300 s, `-swift-check.sh`, `-pf-cu.sh`), `-holds.txt`, `-carry-ok.txt`. The old
repository's numbered state is archived in `/tmp/cu-integrator-history-repo/`. The gate, lock and nightly
worktrees are detached worktrees of this repository under `/tmp`. A `/tmp/cu-integrator-STOP` file stops every
script.

**Rules that bit.** Read any surprising approval ("OK'd" is not an OK). An auto-hold can name the wrong PR: read its
wording. Never re-take a baseline without listing it on a hermetic-test issue (CU-207). An aborted helper build
leaves an empty `CUHelper.app` that poisons its hash (CU-216). GitHub's file list can show a stacked PR's carried
helper files: test the real tree delta. A message's PR number means the repository it was sent for.

**Next.** First baseline on `6314c0c`; the nightly CU-59 at 10:00Z; land the re-opened PRs as they are reviewed.

**Paths.** Worktree `~/computer-use--cu-integrator` (branch `cu/cu-integrator`); the main checkout is the
sync's and never edited. The old worktree stays in the private history checkout.
