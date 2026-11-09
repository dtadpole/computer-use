---
title: chrome-browser environment
created: 2026-11-01T09:52:00Z
modified: 2026-11-09T20:38:06Z
version: 0.13.2
description: The browser environment driver - headless Google Chrome over CDP with a fresh profile, a fixed viewport, every canonical action, a two-layer site filter and the per-run clipboard.
grounded_in:
  - source: _designs_/system-architecture/environment-driver.md@0.4.0
  - source: dtadpole/_seats_/cu-developer-two/headless-chrome-measurements.md@1.3.0
---

# `chrome-browser`

Writer: cu-developer-two. Contract: [environment driver](../../_designs_/system-architecture/environment-driver.md),
[keys and coordinates](../../_designs_/system-architecture/keys-and-coordinates.md). Node 24, no npm; CDP client from
[`browser-use`](../../_vendor_/browser-use/INDEX.md), never edited.

| File | Owns |
|---|---|
| [`environment.mjs`](environment.mjs) | `launchBrowserEnvironment` and the driver object |
| [`launch.mjs`](launch.mjs) | Chrome start and stop: throwaway profile, empty environment, sandbox refusal |
| [`session.mjs`](session.mjs) | CDP session: pages, popups, cross-site frames, held dialogs, isolated worlds |
| [`network.mjs`](network.mjs), [`proxy.mjs`](proxy.mjs) | site filter layers: `Fetch` for page requests, a 127.0.0.1 proxy for WebSocket and the rest |
| [`executor.mjs`](executor.mjs), [`human-input.mjs`](human-input.mjs) | one action: gates, dialog rule, steps, settle, `ActionEffect`; a person's input during take-over |
| [`input-plan.mjs`](input-plan.mjs), [`keys.mjs`](keys.mjs), [`coords.mjs`](coords.mjs) | actions as exact CDP steps; key names; frame and viewport spaces |
| [`clipboard.mjs`](clipboard.mjs), [`page-scripts.mjs`](page-scripts.mjs) | per-run clipboard (D-011); in-page readers - a click on a `<label>` is judged as the control it activates, named by the label when it has no name of its own (CU-351); `keyTarget` answers an accesskey chord with the element it fires (CU-353), a key on a focused select with the option it lands on, and `typeOptions` every option a type passes through (CU-370); a page's navigation to another app's scheme is a session notice (CU-360) |
| [`errors.mjs`](errors.mjs) | `EnvironmentError` codes |
| [`smoke.mjs`](smoke.mjs) | live check: one gated Chrome, 54 checks |

Tests: [`_tests_/chrome-browser/`](../../_tests_/chrome-browser/INDEX.md).

**State (0.9).** Implements environment-driver 0.4 on agent-core's `lib.mjs` (`createSitePolicy`, `resourceGate` with
D-014, `createRunControl`), member for member with agent-core's fake environment; `smoke.mjs` passed 39 of 39 on 2026-11-01, HTML5 drag-and-drop, a scrolled and a cross-site-iframe `inspectPoint`, and DNS rebinding included. The proxy refuses Chrome's own background
traffic and records it as notices. `startScreencast` and `humanInput` serve the [live view](../../_tools_/live-view/INDEX.md). During a held dialog, a screenshot is the last frame, marked `stale`, and the dialog is the target.

**Gaps.** `inspectPoint` resolves a point in a cross-site iframe one level deep, through the frame's own CDP session
(live-checked); deeper frames and `focusedElement` still stop at the iframe element. A name resolving to a non-public
address is refused by the proxy (DNS rebinding, live-checked through a resolver seam).
