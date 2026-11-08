---
title: Desktop fixture tests
created: 2026-11-02T08:34:00Z
modified: 2026-11-08T16:58:00Z
version: 0.3.2
description: Unit tests for the desktop fixture's judges, bundle identity and channel framing; no app is launched.
grounded_in:
  - source: _tools_/desktop-fixture/INDEX.md
---

# Desktop fixture tests

| File | What it covers |
|---|---|
| [tasks.test.mjs](tasks.test.mjs) | judges on empty, right and wrong facts; sandbox judging; injection obey plans; both identities; framing |
| [open-selection.test.mjs](open-selection.test.mjs) | CU-252, CU-269: the Finder stand-in - sandbox rows with AXFilename and AXURL, File > Open, Open With, Command-Down, app-bundle drop targets; each open only recorded |
| [menu-compose.test.mjs](menu-compose.test.mjs) | CU-238: the compose screen's menu chords - Send, the disabled duplicate, Mail's plain Delete, the lazy menu - and what AppKit serves Accessibility for them |
| [approve-always.test.mjs](approve-always.test.mjs) | only the two fixture apps; a y records them by tty, a rerun finds them, an n records nothing |

## Read next

[../../_tools_/desktop-fixture/INDEX.md](../../_tools_/desktop-fixture/INDEX.md).
