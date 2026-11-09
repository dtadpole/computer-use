---
title: computer-use-mcp test suite
created: 2026-11-01T17:40:00Z
modified: 2026-11-08T23:45:00Z
version: 0.7.0
description: Unit tests of the computer-use MCP server - tool schemas and input checks, the JSON-RPC protocol in process and as a child process, a symlinked start and the clean re-exec, whole browser runs on agent-core's fake environment, desktop runs through startRun on the fake desktop helper, and the session proofs' desktop mode (arguments, refusal, prompt, private CU_HOME, helper link, approvals) - with no browser, helper app or key.
grounded_in:
  - source: _tools_/computer-use-mcp/INDEX.md@0.5.0
---

# `computer-use-mcp` suite

`node --test '_tests_/computer-use-mcp/*.test.mjs'` from the project folder; no browser, CUHelper.app, key or network.

| File | Judges |
|---|---|
| [`tools.test.mjs`](tools.test.mjs) | the four tools, bounded inputs, consent refused; `environment`, `apps`, every excluded app, approval inputs refused by name |
| [`server.test.mjs`](server.test.mjs) | handshake, -32601, tool errors, cancelled calls, exit on stdin close; a desktop run end to end through a server process; refusals over the wire |
| [`entry.test.mjs`](entry.test.mjs) | a symlinked start serves; a NODE_PATH or flagged start re-execs once - the serving child clean, SIGTERM and Ctrl-C forwarded, its exit passed on; the parent's signal listeners in place before the child exists and kept until a coded exit (CU-239, on stand-in process and spawn seams) |
| [`runs.test.mjs`](runs.test.mjs) | browser runs: result, screenshot, trajectory, one at a time, questions, control, consent without a live view, shutdown |
| [`desktop.test.mjs`](desktop.test.mjs) | desktop runs: startRun's arguments, the same status shape, completion, declined unattended, a person approving in the live view, a held lock, stop |
| [`desktop-proof.test.mjs`](desktop-proof.test.mjs) | the proofs' desktop mode: `--env`/`--task`/`--announced`, the refusal, the prompt (environment, apps, caps; no `start_url`, no approval wording; `checkStart` accepts it), a clean environment, the helper symlinked never copied, only the task apps' owner tty records copied verbatim and read back by agent core, refusals (C1), evidence |
| [`error-paths.test.mjs`](error-paths.test.mjs) | every error path the others leave: each refusal by its message, tool errors as isError results ("error: " for a non-refusal), -32600, -32601, -32700 with serving going on, bad arguments, a browser that cannot start (CU-58) |
| [`desktop-fake.mjs`](desktop-fake.mjs) | the fake helper's world, the always store, startRun's driver seams |
| [`desktop-server.mjs`](desktop-server.mjs) | server.mjs's `main` with desktop runs on the fake helper (also used by the heddle-plugin suite) |
| [`no-model-example.mjs`](no-model-example.mjs), its [test](no-model-example.test.mjs) | runnable: a fixture read task through DSH's install row and heddle's plugin, the whole cycle, judged by the fixture's judge (CU-57) |

Each desktop run gets a fresh fake helper over stdio and a private lock directory, never `/tmp/cu-desktop-run`.
