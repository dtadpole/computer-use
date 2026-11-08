---
title: Physical confirmation
created: 2026-11-07T23:40:00Z
modified: 2026-11-08T03:50:00Z
level: L1
version: 0.1.4
description: While the owner uses the Mac, a run that would post input starts only on his deliberate hardware click on a helper prompt (D-068) - how the lock asks, what the prompt accepts, and what was measured.
status: unverified
grounded_in:
  - source: D-068 (cu-coordinator, 2026-11-07) and CU-203
  - source: "red team of PR 509 - cu-researcher 20261107T232348, cu-developer-one 20261107T232328, cu-developer-two 20261107T232624, cu-verifier 20261107T234815"
  - source: "cu-verifier's 0.2.49 measurement, inbox 20261108T025022; cu-researcher's residuals, inbox 20261108T025340"
  - source: "cu-verifier's forgery-row options (B), inbox 20261108T034243"
---

# Physical confirmation (D-068, CU-203)

While the Mac is in use, a run that would post input passes the owner-idle check (D-066) only on the owner's
deliberate click on a helper prompt. There is no other exemption.

## Flow (the lock)

1. `acquireDesktopRun` refuses `owner_active`.
2. The environment launches the helper unscoped (no scope, no input), and the lock - never its caller - asks
   `confirmPhysical` over that link. No CLI, environment or MCP parameter can carry a confirmation.
3. The wait (at most 60 s) holds no lock mutex; on `confirmed` every check reruns, so a hold that arrived meanwhile
   still refuses first.
4. A confirmation admits that one run: `hold.log` records `run_admitted` with rule `confirmed`, the event's source and
   the helper's confirmation id, which the helper logs too. The in-run local-input pause still applies; a bare `hold`
   keeps refusing.
5. Against consent fatigue: one prompt at a time; after Cancel or a timeout that seat waits 5 minutes
   (`confirm_backoff`, logged), both enforced by the lock.

## The prompt (the helper)

A helper-owned panel - never in scope, captured or a target, never under the pointer, never taking key focus - says what
is granted, the fixed sentence first: "<seat> wants to post clicks and keys into this session. Confirm lets this one run
start now." The task's words follow, quoted and clipped ('for its run "..."'), never as the title: they are the seat's.

- Only a click on Confirm counts; Return does not.
- Confirm arms 1 s after the panel shows; a press that began before arming is ignored.
- Only a hardware event counts: not tagged `CUSE`, source pid 0 with the HID system's source state. Any posted
  event (osascript, cliclick, `CGEventPost`) is ignored, not read as an answer.
- Cancel or the timeout answers not confirmed.

## Measured (0.2.49, 2026-11-08)

Three samples each through the helper's seams (D-056): a helper-posted untagged event carried the helper's pid,
state 0; one with its pid forged to 0 from a HID-state source came back with the poster's pid, state 1. WindowServer rewrites a posted event's pid, while the HID state can be forged, so `isHardware` needs
both and no IOHID corroboration. The `forged` seam and its measuring command left with the prompt's PR: no request forges
what the helper trusts.

## Limits

- A virtual HID device (a DriverKit keyboard or pointer, e.g. Karabiner-Elements') emits pid-0, HID-state events
  indistinguishable from hardware. Installing one needs the owner's approval, so no seat can add it; if the owner
  has one, a process able to drive it could confirm.
- Screen Sharing input is posted by its daemon (pid not 0): the owner cannot confirm remotely, the safe side.

## Acceptance

Unit checks: a press or release that is tagged, or lacks pid 0 and the HID state, never confirms. No input from
outside the helper (D-056): a posted event's pid is rewritten (measured on moves; clicks inferred); no session can
post at the prompt, so that case is unit-only. In person: the owner's Return and a click within the arming delay do not
confirm; his deliberate click after it does.
