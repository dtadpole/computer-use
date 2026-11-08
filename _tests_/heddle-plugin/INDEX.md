---
title: heddle-plugin test suite
created: 2026-11-01T17:25:00Z
modified: 2026-11-05T16:22:09Z
version: 0.3.2
description: Unit tests of the heddle plugin and its MCP client - against a fake MCP server for registration, text results, the screenshot added once, errors, cancellation, shutdown and desktop fields passed verbatim, against the real server for a desktop run on the fake helper, and heddle-proof's desktop mode - with no heddle, browser, helper app or key.
grounded_in:
  - source: _tools_/heddle-plugin/INDEX.md@0.3.0
---

# `heddle-plugin` suite

`node --test '_tests_/heddle-plugin/*.test.mjs'` from the project folder; it starts
[`fake-mcp-server.mjs`](fake-mcp-server.mjs) as a child process, and for one test the computer-use suite's
[`desktop-server.mjs`](../computer-use-mcp/desktop-server.mjs) (the real server, desktop runs on the fake helper).

| File | Judges |
|---|---|
| [`computer-use.test.mjs`](computer-use.test.mjs) | MCP results to text and image parts, the four registrations, no server before a call, the screenshot sent once to the next main request of the same session and never to side requests, tool errors, cancellation, closing by stdin; the desktop fields in the schema and passed verbatim; a desktop run through the real server ending with its screenshot sent once |
| [`heddle-proof.test.mjs`](heddle-proof.test.mjs) | heddle-proof's desktop mode: its command lines and refusal, the prompt naming the plugin's bare tools with start arguments the server accepts, heddle's environment with `CU_HOME` and no loader variable (the copied approvals and the helper link: the computer-use-mcp suite) |
