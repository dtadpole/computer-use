---
title: probe-kit test suite
created: 2026-11-09T23:30:00Z
modified: 2026-11-12T05:38:15Z
version: 0.3.1
description: "CU-384: the probe kit's drift test - every landed field is still named by its producing file, pending fields are still pending, the browser builders match describeElement, and the kit judges through the real components."
grounded_in:
  - source: _tools_/probe-kit/INDEX.md@0.1.0
---

# `probe-kit` tests

`node --test _tests_/probe-kit/shapes.test.mjs _tests_/probe-kit/loop.test.mjs _tests_/probe-kit/sweeps.test.mjs _tests_/probe-kit/reclass.test.mjs _tests_/probe-kit/heldout.test.mjs _tests_/probe-kit/lowering-check.test.mjs`. sweeps.test.mjs checks that every ruled family keeps a fixture row asking, that a free row is skipped, and that the unruled family is only reported; reclass.test.mjs checks the map and the lost / gained / changed / narrowed split and lostEquals; heldout.test.mjs checks web, dialog and desktop items and the out-of-scope rule; lowering-check.test.mjs checks that a wrong LOWER, KEEP or CLASS item fails. loop.test.mjs drives the real runTask through `throughLoop`: a Finder file dragged into Slack is declined, one moved within Finder is done, and Return on a focused Delete button is declined (the key's target is the loop's focus). No browser, no helper: the source check reads files, the
describeElement check runs the real page script over a stub element, and the policy check uses webPolicy and
deskPolicy. Mutants: renaming a SOURCES field to one no file names fails the first test; marking a landed field
pending fails the second.

## Read next

[`../INDEX.md`](../INDEX.md).
