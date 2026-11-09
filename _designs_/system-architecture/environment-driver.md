---
title: Environment driver interface
created: 2026-11-01T09:24:10Z
modified: 2026-11-09T13:47:48Z
level: L1
version: 0.8.6
description: The interface of the computer the agent drives - launch options, frame, screenshots with region zoom, perform in frame pixels with its effect, targets and page text for policy, screencast and human input, errors - and who calls whom.
status: unverified
grounded_in:
  - source: _seats_/cu-developer-two/environment-interface-proposal.md@1.0.0
  - source: _seats_/cu-developer-two/headless-chrome-measurements.md@1.3.0
  - source: _context_/chatgpt-computer-use/api-sdk-computer-toolset.md@1.0.0
---

# Environment driver interface

Built from cu-developer-two's [proposal](../../_seats_/cu-developer-two/environment-interface-proposal.md);
the decisions it asked for are in [environment-behaviour](environment-behaviour.md).

```js
// _environments_/chrome-browser/ exports
const env = await launchBrowserEnvironment({
  seat, viewport: { width: 1440, height: 900 },   // CSS px, device scale factor 1
  frame: { maxWidth, maxHeight, maxLongEdge, maxPixels, maxTiles, tileSize }, // adapter's maxImage, any subset
  startUrl, sitePolicy, signal, control,           // sitePolicy from agent-core, control = run control
})
```

| Member | Contract |
|---|---|
| `frame` | `{ width, height, scale, viewport, devicePixelRatio: 1 }`; `scale` is the largest value up to 1 that fits `frame`; `width` and `height` are the size Chrome actually returns; fixed for the run |
| `screenshot({ region })` | `{ data, mimeType, width, height, url, title, takenAt }`, PNG; `region` `[x0, y0, x1, y1]` in frame pixels returns that area at full resolution (`zoom`) |
| `perform(action)` | one validated canonical action, frame pixels, canonical keys; checks `control.agentMayAct()`, divides by `scale`, refuses out-of-bounds points (never clamps); returns `ActionEffect { navigated, url, blocked: [{ url, rule }], popup, dialog }` |
| `state()` | `{ url, title, loading, tabs: [{ id, url, title, active }], dialog }` |
| `inspectPoint({ x, y })`, `focusedElement()` | `{ tag, role, name, href, inputType, isPassword, autocomplete, origin, box, fingerprint }` or null, frame pixels; `fingerprint` hashes loader id, frame id, backend node id, role, name, tag and input type, and `box` is compared separately within a tolerance |
| `pageText({ maxChars })` | `{ text, hiddenText }` of the foreground page, read in an isolated world, for the [inspector](untrusted-content.md); `hiddenText` is text not visibly rendered: `display: none`, `visibility: hidden`, opacity 0, zero size, clipped, far off-screen, font under 2 px, `aria-hidden`, or colour equal to its background |
| `navigate({ url })` | serves `navigate`; `history`, `reload`, `handleDialog` serve the live view |
| `startScreencast({ onFrame, maxWidth, quality })`, `stopScreencast()`, `humanInput(event)` | M3; `humanInput` only while `control.humanMayAct()` |
| `on(event, fn)` | `navigation`, `blocked`, `popup`, `dialog`, `download`, `crash` |
| `close()` | idempotent; stops Chrome, removes the profile |

Every member returns a promise except `frame`, `kind`, `site` and `state()`, which is synchronous and safe to await.
While a page dialog is held, `screenshot()` returns the last frame marked stale, `pageText()` the dialog's message,
and target lookups return the dialog itself (`role: 'alertdialog'`); an answer comes back as `effect.dialogAnswered`.
A blocked document fails with `Aborted`; the effect lists it.

Failures throw `EnvironmentError { code, message }`, `message` safe to show the model. Codes: `invalid_argument`,
`unsupported_action`, `blocked_by_policy`, `dialog_open`, `taken_over`, `cancelled`, `timeout`,
`browser_crashed`, `closed`, `resource_refused`, `sandbox_unavailable`.

## Who calls whom

- The CLI or the M4 server launches the environment, with `frame` from the chosen adapter and `sitePolicy` from
  `agent-core`'s `createSitePolicy(config)` ([policy](action-policy.md)), and hands it to `runTask`.
- The loop is the only caller of `perform`, `screenshot`, `inspectPoint`, `focusedElement`, `pageText` during a run;
  the live view calls the screencast and human-input members. `agent-core` never imports a driver.
- Validation is the core's: the batch (schema, key names, bounds against `env.frame`) is checked before its first
  action. The driver re-checks and raises; it never skips, clamps or retries (R15, R19).

`agent-core` ships `createFakeEnvironment()` with these members, a synthetic frame and an input log, so the core's
suites never need Chrome. One environment per run, closed in a `finally` (R3); every action record carries the
site tag `browser:chrome-local` (R4).
