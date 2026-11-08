---
title: '[cu] Developer Two - M1 driver review and sign-off'
created: 2026-11-01T10:14:00Z
modified: 2026-11-05T16:22:58Z
level: L1
version: 1.0.2
description: 'cu-developer-two''s review of the M1 system-architecture design for the environment driver - the answers to Q-D1..Q-D5, the sign-off of design 0.4 for M1 criterion 3, and three non-blocking notes.'
status: unverified
grounded_in:
  - source: dtadpole/computer-use _designs_/system-architecture/environment-driver.md@0.4.0
  - source: dtadpole/computer-use _designs_/system-architecture/environment-behaviour.md@0.4.0
  - source: dtadpole/computer-use _designs_/system-architecture/keys-and-coordinates.md@0.4.0
  - source: dtadpole/computer-use _designs_/system-architecture/site-filter.md@0.3.0
related_to:
  - ref: headless-chrome-measurements.md@1.4.0
    as: depends
---

# M1 driver review and sign-off

**Verdict: signed off.** The driver interface of design 0.4 (f327d4fe2) is exact enough to build against test
doubles: launch options, `frame`, `screenshot`, `perform` with `ActionEffect`, `state`, targets, `pageText`,
screencast, human input, events, error codes, and who calls whom (M1 criterion 3).

## Q-D1..Q-D5 (answered on 0.1, inbox 20261101T094243; evidence in the [measurements](headless-chrome-measurements.md))

| Question | Answer, as folded into 0.4 |
|---|---|
| Q-D1 targets | feasible: `DOM.getNodeForLocation`, `describeNode`, partial AX tree; fingerprint of loader, frame, node, role, name, tag, input type; box compared within a tolerance |
| Q-D2 `clip.scale` | yes; frame from the returned image, mapped per axis |
| Q-D3 network | `Fetch` covers documents, frames, XHR, beacons, popups, redirect hops; WebSocket and WebRTC need the M2 proxy layer |
| Q-D4 screencast | no protocol race; run control serialises agent and human input |
| Q-D5 missing | clipboard (D-011), error codes, effect record, settle, chord rules - all in 0.4 |

## Non-blocking notes for 0.5

1. [untrusted-content](https://github.com/dtadpole/computer-use/blob/main/_designs_/system-architecture/untrusted-content.md) says secrets are substituted
   "inside `environment.execute`": the member is `perform`, and the loop should substitute just before calling it,
   so the driver stays secret-agnostic; `ActionEffect` never carries typed text.
2. `hiddenText` needs a definition. Proposed: text of elements that are not visibly rendered - `display: none`,
   `visibility: hidden`, opacity 0, zero size, clipped, more than one viewport off-screen, font size under 2 px,
   `aria-hidden`, or text colour equal to its background - collected in an isolated world.
3. D-005's team cap of two browsers needs one registry that `resourceGate()` and verify-kit's separate gate both
   honour, for example a pid file per browser under `/tmp/cu-browsers/`: shared on disk, not in code (D-012).

Minor: the `frame` launch option should accept every `fitScale` limit, including Claude's `maxLongEdge`, `maxTiles`
and `tileSize` (`CLAUDE_IMAGE_LIMITS` in `coords.mjs`).
