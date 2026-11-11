---
title: probe-kit test suite
created: 2026-11-09T23:30:00Z
modified: 2026-11-09T23:30:00Z
version: 0.1.0
description: "CU-384: the probe kit's drift test - every landed field is still named by its producing file, pending fields are still pending, the browser builders match describeElement, and the kit judges through the real components."
grounded_in:
  - source: _tools_/probe-kit/INDEX.md@0.1.0
---

# `probe-kit` tests

`node --test _tests_/probe-kit/shapes.test.mjs`. No browser, no helper: the source check reads files, the
describeElement check runs the real page script over a stub element, and the policy check uses webPolicy and
deskPolicy. Mutants: renaming a SOURCES field to one no file names fails the first test; marking a landed field
pending fails the second.

## Read next

[`../INDEX.md`](../INDEX.md).
