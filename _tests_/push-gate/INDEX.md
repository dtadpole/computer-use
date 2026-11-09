---
title: push-gate test suite
created: 2026-11-09T11:20:00Z
modified: 2026-11-09T11:20:00Z
version: 0.1.0
description: "Unit and end-to-end tests of the CU-337 pre-push hook: strict reading of pushed refs, the range each ref adds, refusal on the gate's exit status, deletes ungated, several refs, fail-closed gate lookup, and a real git push to a bare remote."
grounded_in:
  - source: _tools_/push-gate/INDEX.md@0.1.0
---

# `push-gate` tests

A fake gate stands in for the real one, which reads a private list. It logs each range and exits as the row says. No
network: the end-to-end row pushes to a bare repository in a temporary folder.

| File | Judges |
|---|---|
| [`push-gate.test.mjs`](push-gate.test.mjs) | ref lines read strictly; update, new-branch and delete ranges; clean pushes, exit 1 and exit 2 refuse; a delete passes ungated; several refs refuse if one fails; no gate refuses; `git push` refused on a finding and accepted when clean, with `--check` |

Mutants that fail it: ignoring the exit status (the piped-tail pattern), gating a delete, failing open without a gate.
