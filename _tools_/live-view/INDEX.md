---
title: live-view
created: 2026-11-01T17:20:00Z
modified: 2026-11-09T15:00:00Z
version: 0.3.8
description: One run's watch and control page on 127.0.0.1 for browser and desktop runs - the live screen, run events, pause, take over (mouse and keys on a browser run only), hand back, stop, consent answers and guidance, the local-input pause, served over the run's view and control tokens under the fixed title marker - and the live probe that checks it on a live desktop run.
grounded_in:
  - source: _designs_/system-architecture/live-control.md@0.8.1
  - source: _designs_/system-architecture/run-tokens.md@0.8.1
  - source: _designs_/desktop-extension/human-control.md@0.4.3
  - source: _designs_/desktop-extension/app-policy.md@0.3.4
  - source: Linear CU-12 (the live probe)
  - source: Linear CU-38 (the covered-point notice, Q-D11)
---

# `live-view`

Writer: cu-developer-two. Contract: [live-control](../../_designs_/system-architecture/live-control.md),
[run-tokens](../../_designs_/system-architecture/run-tokens.md) and, for desktop runs,
[human-control](../../_designs_/desktop-extension/human-control.md). Node 24, no npm.

```js
const live = await startLiveView({ control, runId, runDir })      // before the site policy
live.attach(env)            // print live.viewUrl and live.controlUrl once; await live.close() at the end
```

| File | Owns |
|---|---|
| [`server.mjs`](server.mjs) | `startLiveView`: tokens, `Host` check, `/events`, `/control`, `/input`, `/screen`, `/runs/<id>`, control link |
| [`ui-logic.mjs`](ui-logic.mjs) | the page's decisions: controls per state, sender and environment, reducer, notices, consent, title |
| [`app.js`](app.js), [`app.css`](app.css) | the page's wiring and style |
| [`live-smoke.mjs`](live-smoke.mjs) | live check with one gated Chrome, 13 checks (browser runs) |
| [`live-probe.mjs`](live-probe.mjs) | CU-12: three checks of a live desktop run from headless Chrome |
| [`owner-checklist.md`](owner-checklist.md) | CU-37, CU-341: the owner session on one page - what the owner does, in order, how long; the Confirm prompt at the Mac or five-minute breaks over Screen Sharing; what to report |
| [`owner-checklist-parts.md`](owner-checklist-parts.md) | the session's three parts (step 4, G2, the Replace chain) - what the owner presses and sees |

**Desktop runs.** `/screen` streams app-scoped PNG frames at 2 fps, each part with `x-cu-frame-at` and `x-cu-scope`
(facts reach `/events` first); `POST /input` refuses `unsupported_on_desktop`. **0.3:** `POST /control` answers 403
for a sender refusal, 409 for a state refusal; `[hidden]` always hides (a browser watcher saw `#nav`).

**Live probe.** `node _tools_/live-view/live-probe.mjs --announced yes --out /tmp/<dir> [--seat cu-<seat>]` runs
its own scripted CU Fixture run in a private CU_HOME (never the default), reads the control link from that run's
mode-600 file, and prints one JSON line per check, then a summary. Check 3 reads the resumed click's settleMs from
the trajectory (effect.settleMs, CU-28).

**Covered point (CU-38, human-only, bundle id only).** A `new_app` row with `appNamedBy: 'hit_test'` says another
app's window covers the agent's point; agent core's notice `point_covered` `{ app }` shows until `{ app: null }` or a
state change. Agent core sends neither yet.

Tests: [`_tests_/live-view/`](../../_tests_/live-view/INDEX.md), 47 of 47 on 2026-11-05; the probe passed live 3/3 (run 20261105T162409Z-007446).
