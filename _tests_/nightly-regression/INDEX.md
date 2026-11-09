---
title: nightly-regression test suite
created: 2026-11-06T04:10:00Z
modified: 2026-11-09T00:14:00Z
version: 0.2.0
description: Unit tests of the nightly regression's pure parts, and end-to-end runs of nightly.mjs on a throwaway repository with a private lock directory - no CUHelper, no fixture app, no model, no network.
grounded_in:
  - source: _tools_/nightly-regression/INDEX.md@0.3.0
---

# `nightly-regression` suite

`node --test _tests_/nightly-regression/*.test.mjs` from the repository root. The end-to-end runs build a scratch
git repository in the temporary directory (a node suite, a verifier that fails once and then passes, a phase-2
verifier, and for CU-304 a test file that would launch CU Fixture) and never touch the team's lock or this checkout's
worktrees.

| File | Judges |
|---|---|
| [`nightly.test.mjs`](nightly.test.mjs) | `parseArgs`; the step plan and its phases; which files launch CU Fixture (import statements, not strings) and their phase-2 step (CU-304); reading spec output, counts and verdicts; pass, flake, fail and skipped; step details; the flake list (counts, first seen, last five heads, no mutation); the verdict, exit, summary line and report; the stripped environment; a green-with-one-flake run with phase 2 under a private lock and both hooks; a node-only RED run; a node-only run that never starts the fixture-launching file in phase 1; another seat's hold waited for; exit 2 on bad arguments |

**State (0.2.0):** 15 of 15, 2026-11-09 (CU-304: a mutant that keeps fixture-launching files in phase 1 fails 2 tests; one
that never detects them fails 2).
