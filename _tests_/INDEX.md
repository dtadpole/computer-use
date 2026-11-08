---
title: computer-use tests
created: 2026-11-01T09:33:46Z
modified: 2026-11-08T09:30:55Z
version: 1.11.0
description: The computer-use project's _tests_ type folder - component suites run with node --test, one instance per suite.
grounded_in:
  - source: _context_/team-operations/working-model.md@1.0.0
---

# `_tests_`

Component suites, no browser and no key. Delivered behaviour is judged in
[`_verifiers_/`](../_verifiers_/INDEX.md). Shared by the [cu] seats; add your row, keep the others.

| Instance | Judges | Owner |
|---|---|---|
| [`agent-core/`](agent-core/INDEX.md) | [`_tools_/agent-core/`](../_tools_/agent-core/INDEX.md) | cu-developer-one |
| [`fixture-site/`](fixture-site/INDEX.md) | [`_tools_/fixture-site/`](../_tools_/fixture-site/INDEX.md) | cu-verifier |
| [`verify-kit/`](verify-kit/INDEX.md) | [`_tools_/verify-kit/`](../_tools_/verify-kit/INDEX.md) | cu-verifier |
| [`task-suite/`](task-suite/INDEX.md) | [`_evaluators_/task-suite/`](../_evaluators_/task-suite/INDEX.md) | cu-verifier |
| [`chrome-browser/`](chrome-browser/INDEX.md) | [`_environments_/chrome-browser/`](../_environments_/chrome-browser/INDEX.md) | cu-developer-two |
| [`macos-desktop/`](macos-desktop/INDEX.md) | [`_environments_/macos-desktop/`](../_environments_/macos-desktop/INDEX.md) | cu-developer-two |
| [`macos-helper/`](macos-helper/INDEX.md) | [`_environments_/macos-desktop/helper/`](../_environments_/macos-desktop/helper/INDEX.md) | cu-developer-three |
| [`live-view/`](live-view/INDEX.md) | [`_tools_/live-view/`](../_tools_/live-view/INDEX.md) | cu-developer-two |
| [`desktop-checks/`](desktop-checks/INDEX.md) | [`_tools_/desktop-checks/`](../_tools_/desktop-checks/INDEX.md) | cu-developer-two |
| [`computer-use-mcp/`](computer-use-mcp/INDEX.md) | [`_tools_/computer-use-mcp/`](../_tools_/computer-use-mcp/INDEX.md) | cu-developer-two |
| [`heddle-plugin/`](heddle-plugin/INDEX.md) | [`_tools_/heddle-plugin/`](../_tools_/heddle-plugin/INDEX.md) | cu-developer-two |
| [`nightly-regression/`](nightly-regression/INDEX.md) | [`_tools_/nightly-regression/`](../_tools_/nightly-regression/INDEX.md) | cu-integrator |
| [`fixture-shapes/`](fixture-shapes/INDEX.md) | not a suite: [`shapes.mjs`](fixture-shapes/shapes.mjs), the key-shaped test values built from fragments | shared |

```bash
node --test _tests_/*/*.test.mjs
```

## Read next

[`../INDEX.md`](../INDEX.md).
