---
title: Pre-hold run-lock fixture
created: 2026-11-08T10:00:00Z
modified: 2026-11-08T10:00:00Z
version: 1.0.0
description: The run-lock module and its two imports exactly as they were before desktop holds existed, so run-lock-sentinel.test.mjs runs the real old code.
grounded_in:
  - source: the parent of commit 010dd7b52 in the private history of this repository (CU-106, D-053)
---

# Pre-hold run-lock fixture

Three files copied byte for byte from the parent of 010dd7b52, the commit that introduced desktop holds:
`_environments_/macos-desktop/run-lock.mjs`, `_environments_/macos-desktop/errors.mjs` and
`_tools_/agent-core/resource-gate.mjs`, kept flat here; the test writes them back under their original relative
paths in a temporary tree so the old module's imports resolve.
[`../run-lock-sentinel.test.mjs`](../run-lock-sentinel.test.mjs) loads them to prove that a checkout older than
holds still honours a live hold. Never edit them: they are evidence of the old behaviour, not code.
