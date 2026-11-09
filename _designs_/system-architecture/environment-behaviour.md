---
title: Browser environment behaviour and decisions
created: 2026-11-01T09:39:00Z
modified: 2026-11-09T13:47:48Z
level: L1
version: 0.8.2
description: The design's answers to cu-developer-two's eight interface decisions, and the runtime rules the browser environment follows - adopted rules, sandbox refusal, per-run clipboard, network layers and the launch gate.
status: unverified
grounded_in:
  - source: _seats_/cu-developer-two/environment-interface-proposal.md@1.0.0
  - source: _seats_/cu-developer-two/environment-behaviour-proposal.md@1.0.0
  - source: _seats_/cu-developer-two/headless-chrome-measurements.md@1.1.0
  - source: _context_/team-operations/decision-log.yaml (D-005, D-008, D-011, D-012, D-014)
---

# Browser environment behaviour and decisions

The runtime rules of cu-developer-two's [behaviour proposal](../../_seats_/cu-developer-two/environment-behaviour-proposal.md)
version 1.0.0 are adopted (settle, held keys, `type`, `drag`, `scroll`, popups, isolation) except where this article
says otherwise. Engine: Chrome over CDP, not Playwright (D-008).

| # | Question | Decision |
|---|---|---|
| 1 | Coordinates at the boundary | Frame pixels; the environment owns the frame and maps per axis ([keys-and-coordinates](keys-and-coordinates.md)) |
| 2 | Key normalisation | Canonical OpenAI upper-case names, owned by `agent-core` (`CANONICAL_KEYS`, `normalizeKey`, `parseKeyCombo`), so validation needs no driver; the driver maps them to CDP and proves coverage |
| 3 | Extras for adapters | Model-facing: `navigate` and region `zoom` only; `history`, `reload`, `handleDialog` serve the live view and rule 5; `inspectPoint`, `focusedElement`, `state` feed policy |
| 4 | `sitePolicy` answering `ask` | No; it answers `'allow'` or `{ block: reason }`. A new origin is asked at the action layer as `confirm` class `new_site` |
| 5 | Dialogs | `alert` accepted and recorded; `confirm`, `prompt`, `beforeunload` held and reported. The model proposes `keypress ENTER` (accept) or `ESCAPE`, `type` fills a prompt, other input raises `dialog_open`; accepting is class `page_dialog`, so a person confirms it unless pre-approved (R34). Permission requests and downloads cannot be held over CDP: the driver denies them and reports them as effects, the loop asks the person (`page_dialog`), and on approval the driver grants that permission or download for the origin so the model may retry |
| 6 | Run control | `control.agentMayAct()` before each agent input, `control.humanMayAct()` before `humanInput` ([live-control](live-control.md)) |
| 7 | `ActionEffect` | the `effect` field of each trajectory `action` event |
| 8 | User agent | `HeadlessChrome` for the local fixtures of M2 and M3; open again when live sites are in scope |

## Rules beyond the proposal

- **Sandbox (D-012).** If Chrome cannot keep its sandbox, launch fails with `sandbox_unavailable`; there is no
  `--no-sandbox` fallback, unlike browser-use's `launchChrome`.
- **Clipboard (D-011).** A per-run buffer: copy and cut read the selection through `Runtime` in an isolated world,
  cut then deletes it, paste types the buffer with `Input.insertText`. Chrome's native clipboard commands are never
  sent; the trajectory records the operation and its length, not the content.
- **Network.** One browser-level `Fetch` handler judges documents, frames, XHR, beacons, popups and every redirect
  hop. WebSocket handshakes and WebRTC escape it, so M2 adds a short-lived 127.0.0.1 proxy in the driver's process
  (`--proxy-server`) that applies the same `sitePolicy` to every `CONNECT` and upgrade, with
  `--force-webrtc-ip-handling-policy=disable_non_proxied_udp`; until then the driver's `INDEX.md` lists the gap.
- **Floor rules.** Page frames never load `file:`, `chrome:`, `devtools:`, `javascript:` or anything
  `isFixedDenied(url)` refuses; Chrome's own `chrome-extension:` requests pass only outside page frames.
- **Settle.** 60 ms after input; a navigation it started is awaited up to `navigationTimeoutMs` (5000), abortable.
- **Launch gate (D-005, D-014).** `agent-core`'s `resourceGate()` implements D-014's registry under
  `/tmp/cu-browsers/` and the memory floor: below 25 percent free, a second browser for the seat or a third for the
  team, launch fails with `resource_refused`. The driver never imports `verify-kit`, whose
  own gate stays a separate implementation, so judge and judged do not share code (D-012).
