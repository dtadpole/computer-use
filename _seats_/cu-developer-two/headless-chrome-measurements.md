---
title: '[cu] Developer Two - headless Chrome measurements on this Mac'
created: 2026-11-01T09:28:00Z
modified: 2026-11-01T17:05:00Z
level: L1
version: 1.4.0
description: 'What headless Chrome 156 on the owner''s Mac does with the CDP calls the browser environment needs - site filtering, scaling, input, popups, dialogs, targets and screencast - measured in probes and the driver smoke check on 2026-11-01.'
status: unverified
grounded_in:
  - experiment: three headless Chrome 156.0.8078.73 probes, 2026-11-01 01.26, 01.29 and 01.40 PDT, scratch scripts /tmp/cu-developer-two-scratch/probe.mjs, probe2.mjs and probe3.mjs, fresh /tmp profile removed after each
  - experiment: probe4.mjs and diag2-4.mjs (02.00-02.10 PDT) and _environments_/chrome-browser/smoke.mjs, one browser at a time, profiles removed
  - source: chromium.googlesource.com/chromium/src/+/main/chrome/browser/headless/chrome_browser_main_extra_parts_headless.cc (blob e08b97b, fetched 2026-11-01)
---

# Headless Chrome measurements (Chrome 156, `--headless=new`, macOS)

The evidence behind the [interface proposal](environment-interface-proposal.md) and the M1 driver review. Each probe used one browser, a local
`node:http` fixture on 127.0.0.1, `connect` from `_projects_/browser-use/cdp.mjs`, and a child environment reduced to
`PATH`, `HOME` and `TMPDIR`.

| Call | Result | Consequence |
|---|---|---|
| `Fetch.enable` on the browser session | pauses page **and popup** requests, and Chrome's own component-extension requests even with `--disable-extensions` | one handler filters every tab at the network layer (R2); internal `chrome-extension:` traffic needs a floor rule |
| Blocked main-frame navigation | `Page.navigate` returns `net::ERR_BLOCKED_BY_CLIENT` | a block is visible and recordable |
| `--force-device-scale-factor=1` plus `Emulation.setDeviceMetricsOverride` 1440x900 | `devicePixelRatio` 1, inner size and screenshot 1440x900 | one coordinate space (R10) |
| `Page.captureScreenshot` with `clip.scale` | 0.5 gives 720x450; a 40x40 region at scale 2 gives 80x80 | downscaling and zoom need no image library (R9, R12) |
| Float mouse coordinates, `modifiers: 8` | accepted; the page sees integer client coordinates and `shiftKey` | held keys map to the modifier bitmask (R16) |
| Mouse `button: back` | navigates history back | no emulation needed |
| `Backspace`, `ArrowLeft`, printable `keyDown` with `text` | work without `commands` | per-character typing works |
| `Control+A`, `Meta+A` | **no effect**; with `commands: ['selectAll']` all is selected | the key table carries editing commands |
| `mouseWheel` deltaY 300 | `scrollY` 300 within 400 ms | wheel plus a short settle |
| `window.open` with a user gesture | new page target with `openerId`; the opener turns `hidden` yet still takes input | the environment moves its foreground to the popup |
| User agent | contains `HeadlessChrome`; `navigator.platform` is `MacIntel` | open question in the proposal |
| `DOM.getNodeForLocation`, `describeNode`, partial AX tree | tag, type, autocomplete, role and name, also inside an iframe (with its `frameId`); empty space gives `HTML` | `targetAt` is feasible (Q-D1) |
| What browser-level `Fetch` pauses | documents, frames, XHR, fetch, beacons, redirect hops; **never WebSocket handshakes** | WebSocket needs a second layer (Q-D3) |
| `Page.startScreencast` | frames keep arriving while `captureScreenshot` and clicks run on the same session | no protocol race (Q-D4) |
| A modifier key event with `nativeVirtualKeyCode` (16 or the macOS 56 for Shift) | animation frames stop for good; every later `mouseMoved` goes unanswered | key events carry no `nativeVirtualKeyCode` |
| A held `confirm` dialog | `Page.getLayoutMetrics` and every `captureScreenshot` variant hang | screenshots return the last frame, marked stale |
| Failing a blocked document with `BlockedByClient` | Chrome commits an error page under the blocked URL, with a history entry | blocked documents are failed with `Aborted` |
| A popup paused by `waitForDebuggerOnStart` | answers `Page.enable` only after `Runtime.runIfWaitingForDebugger` | set-up calls and the resume are sent as one group |
| HTML5 drag-and-drop by mouse events (press, moves, release) | `dragstart`, `dragover`, then `drop` with the `dataTransfer` data | no drag interception needed |
| `--proxy-server` with `--proxy-bypass-list=<-loopback>` | loopback goes through the proxy; `ws:` tunnels with `CONNECT`; Chrome's own update, clock and google.com traffic appears despite `--disable-background-networking` | the proxy judges WebSocket and refuses background traffic |

Source, not runtime (D-011 forbids touching the pasteboard): Chromium's headless start-up installs a platform-independent
clipboard when headless mode is on ([source][headless-clipboard]), so a page's own copy stays inside Chrome; headed
Chrome would use the pasteboard.

[headless-clipboard]: https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/headless/chrome_browser_main_extra_parts_headless.cc
