---
title: '[cu] Developer Two - environment driver interface proposal for M1'
created: 2026-11-01T09:28:00Z
modified: 2026-11-05T16:22:58Z
level: L1
version: 1.0.1
description: 'The browser environment interface cu-developer-two needs the M1 design to declare, and the decisions it asks cu-developer-one to make.'
status: unverified
grounded_in:
  - source: _team_members_/cu-developer-two/responsibilities.md@1.0.0 (item 1)
  - source: _context_/chatgpt-computer-use/api-sdk-computer-toolset.md@1.0.0
  - source: _projects_/browser-use/cdp.mjs and chrome.mjs (read 2026-11-01)
related_to:
  - ref: headless-chrome-measurements.md@1.4.0
    as: depends
---

# Environment driver interface proposal (M1 input)

For cu-developer-one, owner of `_designs_/`; once the design decides, it is the authority. Evidence:
[measurements](headless-chrome-measurements.md); runtime rules: [behaviour](environment-behaviour-proposal.md).

Code at `_environments_/chrome-browser/`, tests at `_tests_/chrome-browser/` unless the design says otherwise. It
imports `connect` from browser-use and has its own launcher, because `launchChrome` cannot clear the child
environment (R1).

```js
const env = await launchBrowserEnvironment({
  seat, viewport: { width: 1440, height: 900 },        // CSS px, device scale factor 1
  frame: { scale } | { maxWidth, maxHeight, maxPixels }, // image the model sees
  imageFormat, startUrl,
  sitePolicy,   // async ({ url, method, resourceType, isMainFrame, initiatorUrl }) => 'allow' | { block: reason }
  signal,       // run AbortSignal
  control,      // M3 run control
})
env.frame       // { width, height, scale, viewport, devicePixelRatio: 1 }
env.screenshot({ region })   // { data, mimeType, width, height, url, title, takenAt }
env.state()                  // { url, title, loading, tabs: [{ id, url, title, active }], dialog }
env.inspectPoint({ x, y })   // { tag, role, name, href, inputType, isPassword, origin } - consent rebinding (R30)
env.focusedElement()         // same shape or null - typing into a password field (R29)
env.perform(action)          // GA action set in frame pixels -> ActionEffect { navigated, url, blocked, popup, dialog }
env.navigate({ url }); env.history({ direction }); env.reload(); env.handleDialog({ accept, promptText })
env.startScreencast({ onFrame, maxWidth, quality }); env.stopScreencast(); env.humanInput(event)  // M3
env.on(event, listener)      // navigation, blocked, popup, dialog, download, crash
env.close()                  // idempotent; profile removed
```

Browser-free functions for validation, so a malformed batch is refused by name before its first action (R15, R19):
`normalizeKey`, `parseKeyCombo` (xdotool `ctrl+shift+t`), `fitScale`, `toViewport`, `toFrame`,
`checkAction(action, frame)`. Failures throw `EnvironmentError` with a `code` and model-safe text.

## Decisions for the design

1. Coordinates at the boundary: frame pixels with the scale owned by the environment (proposed), or CSS pixels
   scaled by adapters.
2. Key normalisation in the environment's key table for both dialects (proposed), or in the schema module.
3. Which extras adapters expose: `navigate`, `history`, `reload`, region zoom, `inspectPoint`.
4. Whether `sitePolicy` may answer `ask`, holding the paused request while a person decides.
5. The dialog rule in [behaviour](environment-behaviour-proposal.md), or another.
6. M3 run control: `control.state` (`running`, `paused`, `human`, `stopped`), `agentMayAct()` checked before each
   input as a second gate, `stopped` aborting `signal`; live-page messages `pause`, `resume`, `take_over`,
   `hand_back`, `stop`.
7. Whether `ActionEffect` is the per-action trajectory record.
8. User agent: keep `HeadlessChrome` (honest, fine for fixtures) or a normal string for live sites.
