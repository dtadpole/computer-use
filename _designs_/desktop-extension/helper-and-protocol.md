---
title: Helper app and protocol
created: 2026-11-02T08:29:12Z
modified: 2026-11-09T13:47:48Z
level: L1
version: 0.3.6
description: The Swift helper that alone holds Screen Recording and Accessibility - its identity, how it is launched so the grants are its own, and an outline of the line protocol between it and the macos-desktop driver.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0 (environment row)
  - source: _context_/chatgpt-computer-use/product-desktop-computer-use.md
  - source: _seats_/cu-developer-two/macos-helper-measurements.md (PR 110, 95d9b4bbe)
  - source: D-068 (cu-coordinator, 2026-11-07) and the red team of CU-203 (cu-researcher, cu-developer-one), inbox 20261107T224612
---

# Helper app and protocol

## Identity (environment row)

`CUHelper.app`, built from Swift sources with `swiftc` by cu-developer-two in `_environments_/macos-desktop/helper/`,
bundle id `com.reflection.cu-helper`. It is the only process the owner grants Screen Recording and Accessibility.
TCC keys an ad-hoc signature to its code hash (measured: `designated => cdhash`, changed by a one-line rebuild), so
an ad-hoc helper loses its grants on every rebuild. Until the owner chooses a stable identity - an Apple
development certificate or a self-signed one created once ([Q-D2](open-questions.md)) - it stays ad hoc and
ungranted (D-025), and every rebuild would need a re-grant. Only one helper runs at a time: a second instance exits. The bundle lives at a
fixed path under `$CU_HOME/helper/`; no grant is ever given to node, a terminal, DSH or a browser.

## Launch: the grants must be the helper's own

macOS charges a child process's TCC checks to its *responsible* process. A helper spawned by node inside a terminal
would ask for, and use, the terminal's grants. So the driver never spawns the binary: it launches the bundle through
LaunchServices (`open -g -n -a CUHelper.app --args --socket <path> --token-file <path> --driver-node <path> --driver-entry <path>`). The helper is then its own
responsible process, and it connects back over a Unix domain socket in a mode-700 directory under `$CU_HOME/run/`.
The first line it sends carries a per-run token read from a mode-600 file, proving the helper to the driver; the
helper checks the driver in turn ([helper boundary](helper-boundary.md)).

## Protocol

One JSON object per line in each direction; requests carry `id`, replies echo it. The same framing runs over stdio
for the fake helper in unit tests. The helper opens with `hello` (token, protocol version, preflight grants,
displays); the driver then sends `scope`, and `capture`, `input`, `hitTest`, `focused`, `screenText`, `watch`,
`pauseOnLocalInput` and `bye`. `scope` is sent again with the union when the driver's `addApp` grows it; a capture may
come as a file in the run's mode-700 directory, read and deleted by the client. Every request, reply, seam and code is
in [helper protocol details](helper-protocol-details.md).

The helper never calls a prompting API (D-024: one owner request, arranged by the coordinator), though macOS itself
may re-ask for Screen Recording (Q-D8).

## Failure

A helper exit or a broken socket ends the run `error: helper_lost`; nothing is retried.

## Physical confirmation (D-068, CU-203)

`confirmPhysical` asks the owner for a deliberate hardware click before an input run starts while he is active;
[physical confirmation](physical-confirmation.md) holds the rule.
