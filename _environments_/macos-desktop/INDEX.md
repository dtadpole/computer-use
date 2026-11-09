---
title: macos-desktop environment
created: 2026-11-02T09:00:00Z
modified: 2026-11-09T13:47:48Z
version: 0.9.1
description: The macOS desktop environment driver of M7 - a Swift helper app that alone holds the grants, a line protocol to it over a peer-checked socket, the team-wide desktop-run lock, and a Node driver that launches with an empty scope, grows it by addApp, records each pointer action's mapping and settles the first input after a human resume, tested only against a fake helper.
grounded_in:
  - source: _designs_/desktop-extension/INDEX.md@0.4.0
  - source: _designs_/desktop-extension/input-and-targets.md@0.4.0
  - source: _designs_/desktop-extension/helper-boundary.md@0.3.4
  - source: _designs_/desktop-extension/app-policy.md@0.3.4
  - source: _designs_/desktop-extension/capture-and-scaling.md@0.3.2
  - source: _designs_/desktop-extension/helper-protocol-details.md@0.4.2 (settleMs)
  - source: _designs_/desktop-extension/human-control.md@0.4.1
  - source: _designs_/desktop-extension/agent-core-changes.md@0.3.3 (C7)
  - source: _designs_/system-architecture/environment-driver.md@0.8.4
  - source: dtadpole/_seats_/cu-developer-two/macos-helper-measurements.md@1.0.0
  - source: dtadpole/_context_/team-operations/decision-log.yaml (D-024, D-025, D-026, D-028, D-029, D-031, D-036)
---

# `macos-desktop`

Writers: cu-developer-two (Node), cu-developer-three (`helper/`, D-026). Contract:
[desktop-extension](../../_designs_/desktop-extension/INDEX.md) and
[environment driver](../../_designs_/system-architecture/environment-driver.md). Node 24, no npm; Swift via `swiftc`.

| File | Owns |
|---|---|
| [`environment.mjs`](environment.mjs) | `launchDesktopEnvironment` (lock, helper, frame, pause); `addApp` confirms the frame; `planBatch`; `mapping`; out-of-scope guards `capture_leak`, `target_out_of_scope` (D-035, D-036) |
| [`run-lock.mjs`](run-lock.mjs) | `acquireDesktopRun`: one desktop run team-wide (D-024); a seat's hold (CLI `hold`, CU-75) refuses others `desktop_held`; only its token ends it (CU-327) |
| [`helper-link.mjs`](helper-link.mjs) | framing, hello, `no_hello`, requests by id, capture files, seams; the socket server's peer check |
| [`launch.mjs`](launch.mjs) | `open -g -n -a CUHelper.app` with `--driver-node`, `--driver-entry`, opt-in `--enforce-boundary`, `--lock-path`; `spawn` seam |
| [`input-plan.mjs`](input-plan.mjs), [`keys.mjs`](keys.mjs), [`coords.mjs`](coords.mjs) | actions as helper events; key codes, copy and paste chords too (D-031); frame and global points; `pid` mode keyboard-only (Q-D3) |
| [`errors.mjs`](errors.mjs) | browser codes plus `helper_lost`, `not_granted`, `out_of_scope`, `display_changed`, `secure_input` |
| [`helper/`](helper/build.sh) | Swift sources of `CUHelper.app` and `build.sh` |

Tests: [`_tests_/macos-desktop/`](../../_tests_/macos-desktop/INDEX.md).

**State (0.7.0).** Live with helper 0.2.x since CU-12; tests use a fake helper. P11: `apps` are candidates; until
the first `addApp`, capture, input and AX refuse `out_of_scope` `no_scope`. `frame` fits the hello's main display; the
first `addApp` capture confirms it, else `display_changed`. C7: pointer effects carry `{frameScaleX, frameScaleY,
originPt, display}`. Run as plain `node <entry>.mjs` (no `NODE_OPTIONS`, `DYLD_*`; a refusal adds `details.driver`); peer check (B5, D-033): `lsof -U`,
`codesign`. Live-check seams: `simulateScale`, `simulateDisplay` (a region as the display, CU-70).

**Targets and stops.** Targets carry `hostedBy`, `panel` (`save`, `open`, `unknown`; other values read as `unknown`)
and `elementOwner`, refused unless approved (CU-39, D-045). Refusal text never names an app; `details.bundleId` does
(CU-47). A stopped drag reports `cancelledDrag`, `releasedAt`, `releasedAtPress` (CU-45). `panelSelection()` gives
`{path, directory, name}`.

**Settle (helper 0.2.8).** The first `input` after a person's resume carries `settleMs` (1500, cap 60 s); local input
meanwhile is only counted; the cap's `local_input` pauses (C4).

**Gaps.** No empty `scope` request; pause `via` is `idleCounter`, `eventTap`, not the design's `idle`, `tap`. Open:
Q-D4, a reused pid holding the lock.
