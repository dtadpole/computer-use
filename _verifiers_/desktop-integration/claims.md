---
title: Desktop integration claims
created: 2026-11-02T10:05:17Z
modified: 2026-11-02T11:31:19Z
level: L1
version: 0.5.0
description: What the desktop-integration verifier claims - a desktop run through startRun reaches the helper and returns the final screenshot and a working trajectory link, refuses without a seat or apps, and (M9) can be started from DSH through the MCP server.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0 (integration row)
  - source: _designs_/desktop-extension/agent-core-changes.md@0.3.3 (C6)
---

# Claims

| # | Claim | Mutant that must fail it |
|---|---|---|
| I1 | A desktop startRun (the root under the CLI, MCP and heddle) reaches the helper and completes | seat-dropped |
| I2 | The result names the final screenshot: a PNG inside the run directory, beside events.jsonl and run.json | no-final-screenshot |
| I3 | The trajectory link works: `cli.mjs replay <run dir>` shows the run and its click | seat-dropped |
| I4 | Without a seat or without apps a desktop run is refused before the helper is reached | - (the driver's own seat check backs startRun's, rightly) |
| I6 | A desktop run from an environment that can load other code (NODE_OPTIONS) is refused, naming the variable, before the helper is reached | unclean-ignored |
| I7 | The CLI runs when started through a symlinked path (macOS /tmp is one): its replay shows the run | symlink-guard-reverted |
| I8 | A CLI desktop run from a DSH-like shell (NODE_PATH set) re-executes clean: refused for its seat by the driver, before any lock, not for its environment | re-exec-removed |
| I5 | DSH can start a desktop run: the MCP server offers macos-desktop (M9) | - |
| I9 | DSH's desktop start refuses, before any run starts: no apps, a browser field, an approval-shaped input (named as such), an excluded app, a pre-approved new_app (M9) | mcp-approval-named, mcp-excluded-start-app, mcp-pre-approve-new-app |
| I10 | DSH's MCP server started from a NODE_PATH shell re-executes clean: a desktop start reaches the driver (refused there for its seat, before any lock), not refused for its environment (M9) | mcp-re-exec-removed |
| I11 | DSH's MCP server answers when started through a symlinked path (M9) | mcp-symlink-guard-reverted |

The driver runs on the fake helper through startRun's environmentOptions, from a clean environment (verify-kit cleanEnvironment), as the owner's shell would. Live DSH and heddle desktop sessions are
the post-grant half, as I6 and I7 were for the browser.

## Read next

[INDEX.md](INDEX.md).
