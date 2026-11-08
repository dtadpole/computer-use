---
title: Desktop traceability
created: 2026-11-02T08:29:12Z
modified: 2026-11-05T16:23:12Z
level: L1
version: 0.3.4
description: Every ULTIMATE_GOAL 2.0 row and every study requirement the desktop changes, traced to the article that meets it and the check that judges it.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0
  - source: _designs_/system-architecture/traceability.md@0.8.4
---

# Desktop traceability

## ULTIMATE_GOAL 2.0 rows

| Row | Met by | Judged by (seed) |
|---|---|---|
| environment | [helper and protocol](helper-and-protocol.md): one helper, its own grants, launched by LaunchServices | the fixture logs each event's source pid and tag: the pid is the helper's (parent launchd, never node); a non-helper preflight-only probe reports no grant |
| perception | [capture and scaling](capture-and-scaling.md) | a click lands within one point of the fixture's reported target, at scale 1 and simulated 2x; each action record keeps its frame scale and `originPt` |
| action contract | [input and targets](input-and-targets.md); the schema unchanged | the fixture's raw input log sees each GA action; a malformed batch and copy, cut, paste chords leave it empty |
| agent loop | unchanged loop and adapters, [agent-core changes](agent-core-changes.md) C5 | the agent-loop verifier against the desktop fake and the fixture app |
| consent and safety | [app policy](app-policy.md), [desktop rules](desktop-rules.md): start apps as candidates (P11), `system_shortcut` (P9), `launch_code` (P10); classes and the inspector unchanged | unapproved app confirm; a stand-in excluded app (run-config entry, recorded in `run.json`) is refused by bundle id and its marker colour is in no run PNG; a consequential fixture button asks; injection screens escalate |
| human control | [human control](human-control.md) | an untagged event (seam `via: 'untagged'`) pauses the run: no tagged event reaches the fixture until a human-channel resume; take over, stop from the live view |
| integration | unchanged MCP server and CLI with `--env macos-desktop` | DSH and heddle sessions run a fixture-app task and get the final screenshot and trajectory link |
| trajectory | [trajectory privacy](trajectory-privacy.md) | a marker string and colour in a secure field and in an unapproved window are in no run file or PNG |
| evaluation | the desktop fixture suite (cu-verifier) | at least 20 fixture-app tasks and 10 injection screens unattended, rates per model and build |

## Study requirements that change

| Req | Browser reading | Desktop reading |
|---|---|---|
| R1 | isolated Chrome, throwaway profile | the helper with its own grants and scope; no VM (D-024) |
| R4 | tag each call with its site | site `desktop:macos-local` on every action record |
| R6 (LATER -> MUST) | - | native macOS control through Screen Recording and Accessibility with per-app approval |
| R29 | sensitive data and credentials | plus secure AX fields: `credential`, value never read |
| R31 | approvals by site and lifetime | approvals by app bundle id: once or always, revocable |
| R32 | never drive our UI or terminals | the hard exclusion table, by app and by window |
| R38, R61 | stop; consent only from human channels | unchanged; plus `local_input` may only pause |
| R43, R44 | redaction, local storage | app-scoped capture; no titles outside scope |

Before the owner's grant, every check runs the driver against the fake helper and the CU Fixture app
(`ai.reflection.cu.fixture`) in offscreen mode; after it, the outside evidence is the fixture's event log and control
frames, the process table, and the run directory.

cu-researcher's desktop requirements R63-R97 (implications-desktop-*, PR #149) replace the draft DR1-DR3 of 0.2; 0.3
resolves its two MUST conflicts (R83 secure fields, R86 held input) and the partials R65, R68, R77, R79, R89, R92, R93.
