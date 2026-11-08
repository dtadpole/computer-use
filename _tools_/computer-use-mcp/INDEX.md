---
title: computer-use-mcp
created: 2026-11-01T17:14:00Z
modified: 2026-11-05T16:22:09Z
version: 0.6.2
description: The computer-use MCP stdio server - start, status, respond and control tools over agent-core's lib.mjs, so a DSH or heddle session can run a browser or macos-desktop task and get the result with its final screenshot and trajectory link - and the session proofs, browser and desktop.
grounded_in:
  - source: _designs_/system-architecture/integration-surface.md@0.8.4
  - source: _designs_/desktop-extension/app-policy.md@0.3.4
  - source: dtadpole/_context_/tool-integration/dsh-mcp-stdio.md
  - source: _evaluators_/desktop-suite/lib.mjs
---

# `computer-use-mcp`

Writer: cu-developer-two (D-017). Contract: [integration surface](../../_designs_/system-architecture/integration-surface.md).
Node 24, no npm.

```yaml
# a DSH patch row; the model sees mcp__cu__computer_use_start and the rest
- insert:
    - id: mcp-computer-use
      name: '@deepseek-ai/dsh-mcp-client'
      config: { serverName: cu, transport: stdio, command: node,
                args: [<this folder>/server.mjs, --seat, cu-mcp, --key-file, <gateway key file>] }
```

| File | Owns |
|---|---|
| [`server.mjs`](server.mjs) | JSON-RPC over stdio: handshake, `tools/list`, `tools/call`, cancellation, exit on stdin close; clean re-exec |
| [`tools.mjs`](tools.mjs) | the four tools' schemas and input checks; consent and app approval refused by name |
| [`runs.mjs`](runs.mjs) | one run at a time: browser as `cli.mjs run`, desktop through `startRun`; status, questions, control |
| [`dsh-proof.mjs`](dsh-proof.mjs) | the session proof in an isolated `/tmp` home: browser by default, desktop with `--env macos-desktop --announced yes`; `--install yes` tests the owner's row |
| [`desktop-proof.mjs`](desktop-proof.mjs) | both proofs' desktop mode: a private `CU_HOME` (helper symlinked; only the task apps' tty 'always' records copied verbatim from the operator's store, D-033, else exit 3: C1), the prompt, the desktop suite's attempt |
| [`install-rows.mjs`](install-rows.mjs) | the owner's DSH and heddle install rows |

**Desktop (M9).** `computer_use_start` takes `environment: 'macos-desktop'`, `apps` (required: candidate bundle ids,
never approvals) and `exclude_apps`. Excluded apps, `start_url`, `new_app` pre-approvals and approval-shaped inputs
are refused by name; a person approves each app. A start with node flags or a loader variable (every DSH shell sets
`NODE_PATH`) re-execs once, clean (D-029 a): no flags, loaders deleted, `CU_MCP_CLEAN_EXEC` against a loop.

**Status shape** (both environments): `{ run_id, state, steps, last_step, question, waiting_for_person, view_url }`,
plus `result` and `trajectory { run_dir, replay_url, replay_command }` once finished, then the final PNG.

Tests: [`_tests_/computer-use-mcp/`](../../_tests_/computer-use-mcp/INDEX.md). `dsh-proof.mjs` passed (browser),
2026-11-01. The desktop proof has not run yet. The fixture's private channel will judge it. A live run needs a helper whose
peer check accepts the checkout the server runs from (CU-2).
