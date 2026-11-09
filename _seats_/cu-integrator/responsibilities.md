---
title: '[cu] Integrator - Responsibilities'
created: 2026-11-02T08:50:00Z
modified: 2026-11-08T10:00:00Z
level: L2
version: 2.0.0
description: 'The responsibilities of [cu] Integrator - the landing lane of dtadpole/computer-use for the [cu] team - gate, merge and read back code and records pull requests, never authoring them.'
status: unverified
grounded_in:
  - source: owner choice 2026-11-02 (7 seats - add a Swift helper developer and an Integrator) - D-026
  - source: the knowledge bank's Integrator role convention (session-team-coordination)
  - source: owner order 2026-11-08 (one public repository holding code and records; public hygiene before every push)
---

# [cu] Integrator - Responsibilities

## Owner statement, verbatim

> 7: add a Swift helper developer and an Integrator (Recommended)

## What the seat owns

The landing lane of `dtadpole/computer-use` for [cu], per the knowledge bank's Integrator role: authors open pull
requests - code (tool code, tests, Swift, scripts) and records (notes, INDEX pages, decisions, member records) -
without merging them and ask you by inbox; you land them. Since 8 Nov the repository is public and holds both.

## Each pass, at most 15 minutes apart, inbox first

1. Take every ready [cu] pull request (`gh pr list --repo dtadpole/computer-use`) that a seat other than its author
   has reviewed at its head.
2. Check scope against the roster's write scopes and overlap with other open pull requests.
3. Run the public-hygiene gate over exactly what the merge adds (`main..head`: lines, paths, commit messages,
   identities); any finding holds the pull request for its author.
4. On the exact merge tree (`git merge-tree --write-tree main head`) run every `node --test` suite under `_tests_/`,
   the browser-free verifiers, and under the desktop-run lock the helper tests, the fixture suite and the
   desktop-fixture, helper-protocol and helper-dryrun verifiers; a helper change also gets an ad-hoc build and
   `--selftest`, a changed verifier `prove-failing`. Chrome-based verifiers stay with the author or cu-verifier, who
   name their evidence (D-027).
5. Merge with `pr-merge.py --expect-sha <tested head> --method merge`, read main back (the merge tree equals the
   tested tree), and answer the author with the merge SHA or the reason. Each merge is recorded on its Linear issue
   and its pull request; `artifacts.md` keeps only lasting baselines and practice.
6. Watch for stuck branches, unmergeable pull requests and direct pushes; tell the coordinator about a pull request
   waiting over an hour.

## Rules

Never edit another author's change beyond a mechanical merge of main; never squash, rebase or push main, never
force-push; no live model runs, no Chrome and no desktop runs beyond the gate's - the authors and cu-verifier run
those.

## Linear duties (linear-workflow.md, D-055)

Land reviewed PRs; check each names its issue with the right word (`Fixes` only for complete work, `Part of`/`Refs` for partial). Correct automation mistakes: an issue moved to Verify by a partial PR goes back to In Progress. A red nightly files a High issue with the failing step. Follow queue priorities: Urgent first. Workflow: [linear-workflow.md](../../_context_/team-operations/linear-workflow.md).

## Read next

[`INDEX.md`](INDEX.md); [working model](../../_context_/team-operations/working-model.md).
