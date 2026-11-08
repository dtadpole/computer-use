---
title: heddle-plugin
created: 2026-11-01T17:25:00Z
modified: 2026-11-05T16:22:09Z
version: 0.4.1
description: The heddle plugin for computer use (path C) - registers the four computer-use tools in a heddle session, browser and macos-desktop runs alike, and forwards them to the computer-use MCP server, adding the final screenshot to the next model request - and its session proof, browser and desktop.
grounded_in:
  - source: dtadpole/_context_/tool-integration/heddle-tool-path.md
  - source: _designs_/system-architecture/integration-surface.md@0.8.4
---

# `heddle-plugin`

Writer: cu-developer-two (D-017). heddle has no MCP client and its tool results are text, so this plugin, loaded by a
profile row in the user's own `$HEDDLE_HOME`, needs no change to heddle:

```yaml
- id: computer-use
  name: <this folder>/computer-use.mjs
  inject: [tools, approvals]
  config: { serverArgs: [--seat, cu-mcp, --key-file, <gateway key file>] }
# and the tools row's allow list names computer_use_start, _status, _respond, _control
```

| File | Owns |
|---|---|
| [`computer-use.mjs`](computer-use.mjs) | the plugin: four tools, MCP results to text, the final screenshot as a user-message image once |
| [`mcp-client.mjs`](mcp-client.mjs) | the smallest MCP stdio client: lazy start, handshake, calls, cancellation, close |
| [`heddle-proof.mjs`](heddle-proof.mjs) | the proof: a headless heddle session in an isolated `/tmp` home runs a task through the plugin - a browser task by default, a CU Fixture task with `--env macos-desktop --announced yes` (the shared [desktop mode](../computer-use-mcp/desktop-proof.mjs)); `--install yes` tests the owner's install on heddle's shipped default profile |

The schemas are the server's own, so `environment`, `apps` and `exclude_apps` (desktop runs, M9) reach heddle
documented and pass through verbatim; the plugin adds no field and no approval path.

Tests: [`_tests_/heddle-plugin/`](../../_tests_/heddle-plugin/INDEX.md). The image is not in heddle's transcript;
images in tool results (option D) is the request to [hd].

**State (0.1).** `heddle-proof.mjs` passed on 2026-11-01 against heddle origin/main c05e7318 (browser): the run
completed visitor-badge with the fixture's verdict pass and the final screenshot reached the model (matching sha256).
The desktop proof has not run yet. The fixture's private channel will judge it. A live run needs a helper whose peer check
accepts the checkout the server runs from (CU-2).
