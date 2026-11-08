---
title: How a DSH session loads and calls an MCP stdio server
created: 2026-11-01T16:58:52Z
modified: 2026-11-01T16:58:52Z
level: L1
version: 1.0.0
description: Where DSH configuration mounts an MCP stdio server and in which scope, how its tools are named, how an image result reaches the model and what the 60 s call timeout does, proven with a stub server through a headless DSH run.
status: unverified
grounded_in:
  - source: 'dsh-mcp-client README, dsh README and dsh-app-boot README in the installed DSH 0.2.1-rc.2 package under ~/.volta/tools/image/packages/@deepseek-ai/dsh (read 2026-11-01)'
  - source: 'probe by cu-researcher 2026-11-01 16.52-16.57 UTC - stub MCP server, a logging proxy and dsh --profile headless in an isolated DSH_HOME, all under /tmp/cu-dsh-mcp-probe'
---

# How a DSH session loads an MCP stdio server

Question 1 of the M4 research. Facts marked *probe* were measured on 2026-11-01; the rest is from DSH's package docs.

## Configuration and scope

One `@deepseek-ai/dsh-mcp-client` entry per server, inserted in a patch layer. The tree composes the bundle patches,
then the profile's `cordis.patch.yml`, then `$DSH_HOME/cordis.patch.yml`, then `--patch` overlays; a patch row
replaces a whole entry config and does not deep-merge (dsh, app-boot READMEs). There is no workspace-level MCP file;
the invocation directory only supplies `.env` keys to the headless profile.

```yaml
- insert:
    - id: mcp-computer-use
      name: '@deepseek-ai/dsh-mcp-client'
      config: { serverName: cu, transport: stdio, command: node, args: [<path>/cli.mjs, mcp] }
```

For the owner's web sessions that row belongs in the web profile or home patch, an owner action; `dsh-hmr` reloads
it live, and a server's tools appear before the first turn. Child agent scopes inherit the parent's tools (dsh-scope).

## Tool naming

The model sees `mcp__<serverName>__<tool>`; `serverName` matches `[A-Za-z0-9_-]{1,32}`, and a name that breaks the
function-name contract is normalised with a 12-hex hash. *Probe:* `mcp__stub__echo`, `mcp__stub__screenshot`,
`mcp__stub__slow` arrived among 31 tools. `serverName: cu` gives `mcp__cu__computer_use_status`.

## Process start

*Probe:* the client starts the server **twice**: a probe process sends `server/discover` (protocol 2026-07-28); on
-32601 a second process gets `initialize` with protocol `2025-11-25` and `capabilities: {}`, then `tools/list`. The
child environment held only `HOME` and `PATH`: `DSH_*` and names matching `KEY|PASSWORD|SECRET|TOKEN` are scrubbed;
configured `env` entries survive. So our server must start cheaply, launch no browser before a call, and exit on stdin
close.

## Images

*Probe:* a `tools/call` result of a text block plus a 640x240 PNG `image` block reached Claude Sonnet 5.5 as a
`tool_result` holding that text, a DSH descriptor ("Image sha256:...; request preview 640x240px. Normalized copy ...
may be resized or re-encoded") and the same PNG; the model read the drawn word correctly. Images pass only when
the route declares image input; PNG, JPEG, WebP and GIF are kept as attachments under `$DSH_HOME/attachments`. The
pi-ai route resizes past 4,194,304 pixels or 1 MiB per image (pi-ai README). Audio and embedded resources become text
diagnostics.

## The 60 s timeout

*Probe:* `slow` with 75 s: at 60.003 s the client sent `notifications/cancelled` (`reason: "SdkError: Request timed
out"`) and the model received an error result, "Request timed out". `toolCallTimeoutMs` (default 60,000) sets it.
The design's `wait_seconds` at most 50 fits; the server must honour cancellation.

## Gateway note

pi-ai's built-in `anthropic` provider aimed at the Conclave gateway sends `thinking.block_binding` and gets 400
"Extra inputs are not permitted"; its compat flags cannot be changed on that provider. A hand-declared route with
`api: anthropic-messages` and an explicit model list works.
