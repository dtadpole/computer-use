---
title: '[cu] Integrator - Responsibilities'
created: 2026-11-02T08:50:00Z
modified: 2026-11-06T11:23:46Z
level: L2
version: 1.2.0
description: 'The responsibilities of [cu] Integrator - the code lane of dtadpole/reflection for the [cu] team - test, merge and read back code pull requests, never authoring them.'
status: unverified
grounded_in:
  - source: owner choice 2026-11-02 (7 seats - add a Swift helper developer and an Integrator) - D-026
  - source: shared/_conventions_/session-team-coordination/integrator-role.md
---

# [cu] Integrator - Responsibilities

## Owner statement, verbatim

> 7: add a Swift helper developer and an Integrator (Recommended)

## What the seat owns

The code lane of `dtadpole/reflection` for [cu], per the [Integrator role](../../../../../shared/_conventions_/session-team-coordination/integrator-role.md):
authors open code pull requests (tool code, tests, Swift, scripts) without merging them and ask you by inbox; you
merge them. Records (notes, INDEX pages, logs, decisions, reviews) stay in the author's own lane.

## Each pass, at most 15 minutes apart, inbox first

1. Take every ready [cu] code pull request (`/opt/homebrew/bin/gh pr list --repo dtadpole/reflection`).
2. Check scope against TEAM.yaml write scopes and overlap with other open pull requests.
3. In your clean worktree, rebase the head onto current `origin/main` and run the named tests plus every
   `node --test` suite under the project's `_tests_/`, the Swift builds the change touches, the browser-free
   verifiers (desktop-fixture, evaluation-suite, any other that starts no Chrome), and `validate-frontmatter.py` on
   the changed files. Chrome-based verifiers stay with the author or cu-verifier, who name their evidence (D-027).
4. Merge with a merge commit (`gh pr merge --merge --delete-branch --match-head-commit`), read main back, and answer
   the author with the merge SHA or the reason. Record each merge decision as a comment on your pinned records issue
   on `dtadpole/reflection`; `artifacts.md` keeps only lasting baselines and practice (D-027).
5. Watch for stuck branches, unmergeable pull requests and direct pushes; tell the coordinator about a pull request
   waiting over an hour.

## Rules

Never author or edit a change beyond a mechanical rebase; never squash, rebase main or push to main; no live model
runs, no Chrome and no desktop runs - the authors and cu-verifier run those.

## Linear duties (linear-workflow.md, D-055)

Land reviewed PRs; check each names its issue with the right word (`Fixes` only for complete work, `Part of`/`Refs` for partial). Correct automation mistakes: an issue moved to Verify by a partial PR goes back to In Progress. A red nightly files a High issue with the failing step. Follow queue priorities: Urgent first. Workflow: [linear-workflow.md](../../_context_/team-operations/linear-workflow.md).

## Read next

[`INDEX.md`](INDEX.md); [working model](../../_context_/team-operations/working-model.md).
