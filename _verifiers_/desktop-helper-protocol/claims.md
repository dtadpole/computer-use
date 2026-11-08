---
title: Desktop helper protocol claims
created: 2026-11-02T09:04:33Z
modified: 2026-11-02T09:36:30Z
level: L1
version: 0.3.0
description: What the desktop-helper-protocol verifier claims - a desktop helper speaks desktop-extension 0.2, refusing by name, capturing nothing before a scope, refusing excluded apps by bundle id, posting nothing before the grant, pausing on local input and exiting on bye.
status: unverified
grounded_in:
  - source: _designs_/desktop-extension/helper-and-protocol.md@0.2.0
---

# Claims

| # | Claim | Proven able to fail on (test double) |
|---|---|---|
| H1 | The opening hello names protocol 1, the helper version, the four grants of 0.3.1 (screen, accessibility, postEvents, listenEvents) and the displays | a hello without grants |
| H9 | Over the driver's socket, the hello carries back the launcher's token | a wrong token |
| H2 | An unknown request is refused as `unknown_request` | an unknown request answered ok |
| H3 | A known request with an unknown field is refused as `unknown_field` | unknown fields ignored |
| H4 | Nothing is captured before a scope is set (`no_scope`; `not_granted` also refuses it while the screen grant is missing) | a capture without a scope |
| H5 | A scope naming any of the design's 24 excluded entries is refused as `excluded`, by bundle id | exclusions ignored |
| H6 | Before the grant, input is refused as `not_granted` | input accepted ungranted |
| H7 | Armed, a local-input report (`simulateLocalInput` via `idle`, which needs no grant) emits `localInput` with an ISO 8601 `at` and stops further input (M8) | no pause |
| H8 | `bye` ends the helper | no exit |

Each check is first shown to hold on a conformant test double and to fail on its one breach
(`_tests_/verify-kit/helper-conformance.test.mjs`). The verifier then judges cu-developer-two's fake helper, and
the Swift helper before the grant.

## Read next

[INDEX.md](INDEX.md).
