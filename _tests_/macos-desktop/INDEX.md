---
title: macos-desktop test suite
created: 2026-11-02T09:00:00Z
modified: 2026-11-09T01:45:00Z
version: 0.9.0
description: Unit tests of the macos-desktop environment - keys, coordinates, input planning and batch refusal, the helper link with the helper's peer boundary and the driver's peer check, launch and helper arguments, the desktop-run lock, the empty launch scope and addApp, the frame known at launch, effect mappings, the design's seams, the settle after a human resume, grants and targets, the environment end to end - against a fake helper, with no app, no grant and no screen.
grounded_in:
  - source: _environments_/macos-desktop/INDEX.md@0.6.3
---

# `macos-desktop` suite

`node --test --test-timeout=30000 '_tests_/macos-desktop/*.test.mjs'` from the project folder. Nothing here starts
CUHelper.app or runs `open`; `lsof` and `codesign` run only against node children. [`fake-helper.mjs`](fake-helper.mjs)
is the protocol reference at parity with helper 0.2.2: the real command line (exit 64), scope of 1 to 32 ids, peer
check before the token, the tap's grant rule, the mid-batch `secure_input`; helper 0.2.8's `input {settleMs}`, spent
per local input, guards armed meanwhile, with seams `personActiveMs` (the person after a resume) and `settleCapMs`.
[`harness.mjs`](harness.mjs) starts it, approves apps through `addApp`, and gives each test its own lock.
[`png.mjs`](png.mjs) makes real PNGs.

| File | Judges |
|---|---|
| [`keys.test.mjs`](keys.test.mjs), [`coords.test.mjs`](coords.test.mjs) | key codes, flags, copy and paste chords (D-031); fit, per-axis mapping, zoom regions |
| [`input-plan.test.mjs`](input-plan.test.mjs), [`plan-batch.test.mjs`](plan-batch.test.mjs) | each action's events; `planBatch` sends nothing, parity with `perform` |
| [`helper-link.test.mjs`](helper-link.test.mjs) | framing, hello, unknown reply id, exit, timeout; socket modes; seams |
| [`peer-boundary.test.mjs`](peer-boundary.test.mjs), [`peer-check.test.mjs`](peer-check.test.mjs) | the helper's peer check, `no_hello`; B5 on the driver's socket |
| [`launch.test.mjs`](launch.test.mjs) | `open` arguments with the driver's real paths and boundary flags, through `spawn` only |
| [`fake-args.test.mjs`](fake-args.test.mjs) | the fake refuses what the helper refuses; enforced boundary, private lock |
| [`empty-scope.test.mjs`](empty-scope.test.mjs) | P11: no scope or capture at launch, `no_scope` refusals, the first `addApp` |
| [`frame-at-launch.test.mjs`](frame-at-launch.test.mjs) | `frame` fitted from the hello with no capture; kept by the first `addApp`, else `display_changed` |
| [`multi-display.test.mjs`](multi-display.test.mjs) | CU-60 dry-run half: the fake's multi-display world - a display to the right (positive origin) and one above (negative y, Retina): frame points reach the helper as that display's global points; a window spanning two displays: past the frame's edge refused, nothing posted |
| [`mapping.test.mjs`](mapping.test.mjs) | C7: each pointer effect's mapping reproduces the points posted, scale 1, 2, fractional |
| [`run-lock.test.mjs`](run-lock.test.mjs), [`add-app.test.mjs`](add-app.test.mjs) | one run team-wide; `addApp` unions, excluded ids unsent |
| [`run-lock-sentinel.test.mjs`](run-lock-sentinel.test.mjs) | CU-106: a CLI hold binds the pre-hold run-lock module (from git) through a keeper's run.json sentinel; swaps by rename with no gap (a tight-loop reader); a killed holder's run restored within a second; the keeper leaves at the end; a killed keeper; --wait-free and status |
| [`seams.test.mjs`](seams.test.mjs) | captures by path; `simulateScale`; local input per guard, pause `via` |
| [`grants-and-targets.test.mjs`](grants-and-targets.test.mjs) | both `secure_input` forms; `postEvents`; `opaque`, fingerprints; clipboard policy before or after C9's revert |
| [`web-area.test.mjs`](web-area.test.mjs) | CU-322: the helper's `inWebArea` on targets at a point and where focus is; absent unless the helper sends a boolean (its null for a failed walk, or an older helper's silence); outside the fingerprint |
| [`target-check.test.mjs`](target-check.test.mjs), [`file-panels.test.mjs`](file-panels.test.mjs), [`panel-marker.test.mjs`](panel-marker.test.mjs) | D-036: pointer targets hit-tested, unapproved apps refused unsent; panels |
| [`settle.test.mjs`](settle.test.mjs) | `settleMs` only after a resume; hands-off wait, cap; reports meanwhile pause nothing; spent, ranges |
| [`environment.test.mjs`](environment.test.mjs) | options, launch order, actions, grants, targets, local input, socket path |

The Swift helper's checks are in [`_tests_/macos-helper/`](../macos-helper/INDEX.md) (D-026).
