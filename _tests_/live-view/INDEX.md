---
title: live-view test suite
created: 2026-11-01T17:20:00Z
modified: 2026-11-06T01:00:42Z
version: 0.3.5
description: Unit tests of the live view - the page's decisions and the server's tokens, permissions, event stream, screen stream, human input, control link and replay - for browser runs and, on the fake desktop helper, desktop runs, plus the live probe's pure parts and checks, with no browser and no CUHelper.app.
grounded_in:
  - source: _tools_/live-view/INDEX.md@0.3.3
---

# `live-view` suite

`node --test '_tests_/live-view/*.test.mjs'` from the project folder; loopback sockets only, no browser, key or
CUHelper.app. The server tests use agent-core's real run control and a fake environment; the desktop tests use the
macOS desktop driver on the [fake helper](../macos-desktop/harness.mjs), each run with a private lock directory.

| File | Judges |
|---|---|
| [`ui-logic.test.mjs`](ui-logic.test.mjs) | controls per state, sender and environment; reducer, notices, waiting for an app; consent and the CU-38 covered-point line and notice; title; mapping and log lines |
| [`server.test.mjs`](server.test.mjs) | tokens and `Host`, headers, title marker, watcher versus control (403 by sender, 409 by state), human input, events, MJPEG, control link, replay |
| [`desktop.test.mjs`](desktop.test.mjs) | desktop runs: no frames before `addApp`, PNG parts with scope metadata after; `/input` refused by name; take over and hand back; the local-input pause; `new_app` consent; the watch token; CU-38: the driver's `target_out_of_scope` to a `point_covered` notice, and a `startRun` click on an overlay asking `new_app` |
| [`live-probe.test.mjs`](live-probe.test.mjs) | the live probe: flags, the `--announced` and CU_HOME refusals, the line format, links from the CLI line and the mode-600 file, the plan, the judges, and checks 1-3 against the in-process live view, end to end on `startRun` with settleMs read from the fake helper, and from a live run's trajectory effect (CU-28) |

The probe's watch page is rendered from the served HTML and `pageFor`, without Chrome. A real browser is checked by [`live-smoke.mjs`](../../_tools_/live-view/live-smoke.mjs) and, live, by
[`live-probe.mjs`](../../_tools_/live-view/live-probe.mjs). **State (0.3.3):** 47 of 47, 2026-11-05.
