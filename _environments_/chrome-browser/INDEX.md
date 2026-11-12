---
title: chrome-browser environment
created: 2026-11-01T09:52:00Z
modified: 2026-11-10T03:10:00Z
version: 0.13.7
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
| [`clipboard.mjs`](clipboard.mjs), [`page-scripts.mjs`](page-scripts.mjs) | per-run clipboard (D-011); in-page readers - each behaviour is a line under **Behaviours** |
| [`errors.mjs`](errors.mjs) | `EnvironmentError` codes |
| [`smoke.mjs`](smoke.mjs) | live check: one gated Chrome; it prints its own count |

**Behaviours.** One line per issue, sorted by issue number. A driver change adds its own line, and no shared line or
count changes (CU-383).

- CU-336: an iframe whose accessible name is unread is named from aria-labelledby, aria-label or title.
- CU-351: a click on a `<label>` is judged as the control it activates, named by the label when it has no name of its own.
- CU-353: `keyTarget` answers an accesskey chord with the element it fires.
- CU-357: an effect reports the session's notices since the last one - a refused download, an accepted alert.
- CU-360: a page's navigation to another app's scheme is a session notice, with a best-effort stop.
- CU-368: a same-origin frame editor's focus is its body, a text entry.
- CU-370: a key on a focused select answers the option it lands on, and `typeOptions` every option a type passes through;
  an ARIA listbox's active option falls back to aria-selected, then a focused option.
- CU-373: a toggle's checked or pressed state reaches the target.

Tests: [`_tests_/chrome-browser/`](../../_tests_/chrome-browser/INDEX.md).

**State (0.9).** Implements environment-driver 0.4 on agent-core's `lib.mjs` (`createSitePolicy`, `resourceGate` with
D-014, `createRunControl`), member for member with agent-core's fake environment; `smoke.mjs` passed 39 of 39 on 2026-11-01, HTML5 drag-and-drop, a scrolled and a cross-site-iframe `inspectPoint`, and DNS rebinding included. The proxy refuses Chrome's own background
traffic and records it as notices. `startScreencast` and `humanInput` serve the [live view](../../_tools_/live-view/INDEX.md). During a held dialog, a screenshot is the last frame, marked `stale`, and the dialog is the target.

**Gaps.** `inspectPoint` resolves a point in a cross-site iframe one level deep, through the frame's own CDP session
(live-checked); deeper frames and `focusedElement` still stop at the iframe element. A name resolving to a non-public
address is refused by the proxy (DNS rebinding, live-checked through a resolver seam).
