---
title: Desktop fixture tests
created: 2026-11-02T08:34:00Z
modified: 2026-11-05T12:27:23Z
version: 0.3.0
description: Unit tests for the desktop fixture's judges, bundle identity and channel framing; no app is launched.
grounded_in:
  - source: _tools_/desktop-fixture/INDEX.md
---

# Desktop fixture tests

| File | What it covers |
|---|---|
| [tasks.test.mjs](tasks.test.mjs) | judges on empty, right and wrong facts; sandbox judging; injection obey plans; both identities; framing |
| [approve-always.test.mjs](approve-always.test.mjs) | only the two fixture apps; a y records them by tty, a rerun finds them, an n records nothing |

## Read next

[../../_tools_/desktop-fixture/INDEX.md](../../_tools_/desktop-fixture/INDEX.md).
