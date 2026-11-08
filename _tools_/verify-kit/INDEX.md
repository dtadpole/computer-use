---
title: Verify kit
created: 2026-11-01T09:33:46Z
modified: 2026-11-08T10:22:47Z
version: 1.12.0
description: Helpers the [cu] checks share - starting a check browser through the D-014 registry and the D-005 memory gate, a reference CDP input executor for canonical actions, and the oracle plan runner.
grounded_in:
  - source: _context_/team-operations/decision-log.yaml (D-005, D-012, D-014)
---

# Verify kit

Judge-side only: it imports nothing from agent-core or the environments it helps judge (D-012).

| File | Owns |
|---|---|
| [browser-gate.mjs](browser-gate.mjs) | `memoryGate()` (25 percent floor; `CU_MIN_FREE_PERCENT` may only raise it), `throwawayProfile(seat)`, and `removeThrowawayProfile(path)`, which refuses any path but `/tmp/<seat>-chrome-XXXXXX` |
| [check-browser.mjs](check-browser.mjs) | `startCheckBrowser()`, `stopCheckBrowser()`: how a check starts Chrome - profile, registry slot, memory floor, downloads denied |
| [browser-registry.mjs](browser-registry.mjs) | verify-kit's own D-014 implementation: `/tmp/cu-browsers` with an mkdir lock, one browser per seat, two for the team |
| [cdp-input.mjs](cdp-input.mjs) | `inputEvents(action)`: a canonical action as CDP `Input` events; unknown actions and keys refused by name |
| [sut.mjs](sut.mjs) | `loadSut()`: agent-core and the driver from `CU_VERIFY_SUT` or this tree; `createMutant()`: a broken copy under `/tmp/cu-verifier-mutant-XXXXXX` |
| [prove-failing.mjs](prove-failing.mjs) | runs a verifier against each `mutants.mjs` entry (logs in `/tmp/cu-verifier-proofs/`); holds only if all give 1 |
| [desktop-evidence.mjs](desktop-evidence.mjs) | desktop judging: landing points, event sources, stuck input (every down has its up), the marker colour in run PNGs, strings in run files |
| [helper-build.mjs](helper-build.mjs), [window-table.swift](window-table.swift) | CUHelper built from the code under test, and a probe listing a process's on-screen windows (no grant) |
| [helper-client.mjs](helper-client.mjs), [helper-conformance.mjs](helper-conformance.mjs) | the desktop helper protocol (0.2) client over stdio or the driver's socket, and its conformance checks with the design's exclusions |
| [driver.mjs](driver.mjs) | `launchDriver()`, `launchRefusal()`: a refused launch is unjudged; recorder event reads |
| [mcp-client.mjs](mcp-client.mjs) | `startMcpServer()`: an MCP client over stdio, newline-delimited JSON-RPC |
| [png.mjs](png.mjs) | `decodePng()`: 8-bit RGB or RGBA, all five filters, for reading a screenshot pixel; `solidPng` writes a solid-colour PNG for dry-run worlds |
| [build-sources.mjs](build-sources.mjs) | where a recorded build commit lives: this repository, reflection, then the history checkout named only by the local config or `CU_VERIFY_HISTORY` (CU-222); reads the local config itself, not through agent-core |
| [plan-runner.mjs](plan-runner.mjs) | `runPlan`: resolve each oracle step from fresh target boxes, refuse offscreen clicks, wait out scrolls, follow new tabs; `denyDownloads` |

A closed gate makes a check unjudged (exit 3), never a pass. Suite:
[`_tests_/verify-kit/`](../../_tests_/verify-kit/INDEX.md). Owner: cu-verifier; other seats may import it.

## Read next

[`../INDEX.md`](../INDEX.md).
