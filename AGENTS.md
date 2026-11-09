---
title: AGENTS.md
created: 2026-11-08T09:40:00Z
modified: 2026-11-08T23:25:02Z
version: 1.2.0
description: The entry point for whoever works in this repository - what it is, the conventions it follows, and how a change is finished.
grounded_in:
  - source: owner's order of 2026-11-08 (computer-use becomes one public repository holding its code and its records, by the knowledge-bank conventions)
  - source: Linear CU-228 (old pull request numbers collide with this repository's)
---

# AGENTS.md

The harness loads this file in every session here: what the repository is, the conventions that bind, and how a
change is finished.

## What this repository is

`computer-use` is a computer-use agent for native macOS, built by the [cu] team: it completes a task by
looking at screenshots of approved apps and driving mouse and keyboard through a signed helper app, with
per-app approval, consent at the point of risk, and a person able to watch, pause, take over and stop.
What completes it is [`ULTIMATE_GOAL.md`](ULTIMATE_GOAL.md), one row per verifiable part, each decided by a
verifier under [`_verifiers_/`](_verifiers_/INDEX.md). The repository holds the code, its tests and verifiers,
and the team's records (research in [`_context_/`](_context_/INDEX.md), one record per seat in
[`_team_members_/`](_team_members_/INDEX.md)). [`INDEX.md`](INDEX.md) maps every folder.

## Conventions that bind here

This repository is a knowledge bank: each artifact (tool, test suite, verifier, design, record) is a kebab-case
instance in a registered `_type_` folder. Of the owner's knowledge-bank conventions, these bind here:

- **Working agreements** - replies to the owner are in Chinese; files, logs and messages are in English.
- **Entry points** - every content folder carries an `INDEX.md` saying what it is and what to read next.
- **Type and instance trees** - `_tools_/`, `_tests_/`, `_verifiers_/`, `_evaluators_/`, `_environments_/`,
  `_designs_/`, `_guides_/`, `_context_/`, `_team_members_/` and `_vendor_/` hold kebab-case instances.
- **Frontmatter** - every authored Markdown artifact starts with YAML frontmatter (title, created, modified,
  version, description, grounded_in); a value never contains a colon unless quoted.
- **Local folder layout** - the main checkout `~/dtadpole/computer-use` (old paths symlink to it) is the sync's,
  never edited; a session edits only in its own worktree `~/dtadpole/computer-use-wt/<session-id>`. A CUHelper run
  still starts from `~/computer-use--<seat>`, the paths the installed helper admits, until helper 0.2.58 admits the
  convention paths (D-077).
- **Landing** - `main` is pull-request only and protected; the integrator lands reviewed, gated SHAs. Nobody
  force-pushes or pushes `main`.
- **Pull request numbers** - restarted at #1 on 2026-11-08: in an older record, #N is a pull request of the private
  `computer-use-history`; newer records write `old #N` and link none.

## Public hygiene

This repository is public. Before any push, the integrator runs the public-hygiene gate over exactly what the
push adds (every added line, path, commit message and identity), and no change may carry a home path, a
person's name or e-mail, an internal model id, an internal host or domain, a session id, a private IPv4
address, or a key-shaped literal. Machine-specific paths and private model aliases live in the local
configuration (`~/.config/computer-use/config.json`, read by `_tools_/agent-core/local-config.mjs`), never in
the tree. Test values shaped like secrets are built at runtime from fragments, never written as literals.
The live roster (session ids) and session-bearing logs stay in the owner's private records.

## Finishing a change

1. The node tests of the folders you touched pass (`node --test <files>`); helper changes also pass
   the helper's unit tests ([`_tests_/macos-helper/`](_tests_/macos-helper/INDEX.md)).
2. The verifier of any ULTIMATE_GOAL row you touched still passes, with its mutants failing.
3. The public-hygiene gate is clean over your branch.
4. The pull request names its Linear issue: `Fixes CU-n` when it completes the issue, `Part of CU-n` otherwise.
