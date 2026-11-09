---
title: Desktop fixture tests
created: 2026-11-02T08:34:00Z
modified: 2026-11-09T17:36:00Z
version: 0.7.1
description: Tests of the desktop fixture - its judges, bundle identity and channel framing, and its screens in the real CU Fixture app, which they launch; run them only under the desktop-run lock (CU-305).
grounded_in:
  - source: _tools_/desktop-fixture/INDEX.md
---

# Desktop fixture tests

Most files here launch the real CU Fixture (offscreen, no input), so they run in phase 2 under the desktop-run lock:
the nightly and the gate hold the run; a seat takes `run-lock.mjs hold --seat S` and exports `CU_DESKTOP_SEAT=S`.
Since CU-305 `launchFixture` refuses otherwise ([fixture-launch-lock](../../_designs_/system-architecture/fixture-launch-lock.md)).

| File | What it covers |
|---|---|
| [launch-lock.test.mjs](launch-lock.test.mjs) | CU-305: the launcher's lock check - no lock, another seat's hold, one's own hold, a run held by an ancestor, a sentinel, a dead pid, an expired hold (scratch lock, fake executable) |
| [tasks.test.mjs](tasks.test.mjs) | judges on empty, right and wrong facts; sandbox judging; injection obey plans; both identities; framing; CU-360's probe scheme in the Info.plist, the openURL record (scheme and path only) and a build that registers nothing (no launch) |
| [open-selection.test.mjs](open-selection.test.mjs) | CU-252, CU-269: the Finder stand-in - sandbox rows with AXFilename and AXURL, File > Open, Open With, Command-Down, app-bundle drop targets; each open only recorded |
| [menu-compose.test.mjs](menu-compose.test.mjs) | CU-238: the compose screen's menu chords - Send, the disabled duplicate, Mail's plain Delete, the lazy menu - and what AppKit serves Accessibility for them |
| [manual-ax.test.mjs](manual-ax.test.mjs) | CU-329: the app element answers AXManualAccessibility like an Electron app (no value, then stored; settable, listed); outside writes recorded in order; a preset is not a write |
| [named-controls.test.mjs](named-controls.test.mjs) | CU-245/CU-258/CU-261/CU-323: entries, buttons, check boxes and Actions menu items named by the harness; a press, toggle or choice records its index only; entry lengths, never text |
| [approve-always.test.mjs](approve-always.test.mjs) | only the two fixture apps; a y records them by tty, a rerun finds them, an n records nothing |

## Read next

[../../_tools_/desktop-fixture/INDEX.md](../../_tools_/desktop-fixture/INDEX.md).
