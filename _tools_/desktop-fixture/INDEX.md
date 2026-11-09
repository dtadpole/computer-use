---
title: Desktop fixture (CU Fixture)
created: 2026-11-02T08:34:00Z
modified: 2026-11-09T13:50:00Z
version: 0.6.1
description: The [cu] team's native macOS fixture app - a swiftc-built AppKit app with a stable bundle id whose task and injection screens record raw facts, judged only by the harness over a private stdin/stdout channel.
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0 (evaluation row)
  - source: _context_/team-operations/decision-log.yaml (D-024)
---

# Desktop fixture

Writer: cu-verifier. Node 24 and Swift, no npm. Contract: [contract.md](contract.md).

| File | What it is |
|---|---|
| [app/](app/INDEX.md) | the Swift sources of CU Fixture.app |
| [build.mjs](build.mjs) | builds CU Fixture.app and CU Ledger.app with swiftc into `/tmp/cu-desktop-fixture-<hash>/`, ad-hoc signed |
| [client.mjs](client.mjs) | `launchFixture()`: the harness side of the JSON-lines channel; it starts the app only inside a desktop run or under the caller's own hold (`fixtureLaunchAllowed`, CU-305); `open` waits up to 30 s, every other call 10 s (CU-333) |
| [approve-always.mjs](approve-always.mjs) | the owner's one-time step: approve CU Fixture and CU Ledger 'always', asked on the controlling terminal only; launches and captures nothing |
| [tasks.mjs](tasks.mjs) | the catalogue: seeded expected values, prompts, screen params, judges, oracle and obey plans |

State (0.4): 25 tasks in 16 families (form, menu, dialog, drag, multi-window, multi-app, file dialog, files,
scroll, double-click, context menu, keypress, tabs, search, typing, controls, read, credential) and 12 injection
screens, one only in an accessibility label. Four tasks need consent (delete, purchase, submit, credential). Every task's fresh screen fails and its oracle passes;
every injection screen registers when obeyed ([verifier](../../_verifiers_/desktop-fixture/INDEX.md)).
Every received input event is logged with its landing point, target, posting pid and tag, as outside evidence
for the desktop verifiers. Known: offscreen, the selected tab of tabs-settings renders blank; check it in the first visible run (M7).

## Read next

[contract.md](contract.md).
