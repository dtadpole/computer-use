---
title: The smallest heddle change that lets a heddle session call computer use
created: 2026-11-01T16:58:52Z
modified: 2026-11-01T16:58:52Z
level: L1
version: 1.0.0
description: How heddle registers tools, why no heddle tool can return an image today, four ways to expose our tool to a heddle session compared, and the recommended path plus the one request to the [hd] team.
status: unverified
grounded_in:
  - source: 'heddle source at origin/main 9c7966112 (2026-11-01), read with git show in ~/heddle; key lines re-checked unchanged at b906e4fbe'
  - source: _designs_/system-architecture/integration-surface.md (design 0.8.1)
---

# The smallest heddle change for computer use

Question 2 of the M4 research, read from heddle's source only; nothing was run. Paths are in heddle's repository.

## What heddle has

- **Outside plugins load without a core change.** A profile row `- insert: [{id, name: /abs/plugin.mjs, inject:
  [tools, approvals]}]` resolves a `/` or `.` name as a URL (`src/boot.ts:110-122`); heddle's verifier requires an
  outside tool to plug in (`_verifiers_/40-pluggable-tools/check-tools.mjs:229`). The plugin calls
  `ctx.tools.register({spec, run})` (`src/tools/service.ts:121-129`), checked only for a non-blank name and description.
- **Results are text.** `ToolResult {output, error?, data?}`; `data` is "never sent to the model unless in `output`"
  (`service.ts:45-63`). The loop stores each tool message as one text part (`src/agent/loop.ts:778-782`), and the
  Anthropic and Responses adapters send tool results as text (`src/llm/adapters.ts:830-833`, `341-349`); the Rust
  build matches. **No heddle tool can return an image today.**
- **Images in user messages work** on all three adapters for endpoints declaring image input
  (`src/llm/attachments.ts:118-124`); a plugin can add one in the `model/request` waterfall (`src/llm/service.ts:218`),
  as `src/plugins/jobs.ts:196` already rewrites requests.
- **No call timeout**; only the turn's Stop aborts a call (`loop.ts:755-760`). Our `wait_seconds` of at most 50
  bounds `status` alone.
- **Approvals:** `check()` in `ask` mode refuses without asking (`src/approvals/service.ts:126-142`); a plugin may
  call `request()`, which reaches a person only in a web session (`service.ts:177-212`). It can gate starting a run,
  never consent inside it (R61).
- **Rust:** no module loading; an outside tool is a process speaking `heddle-component/1`, a line-delimited JSON-RPC
  with a 10 s startup limit and text results (`rust/crates/heddle-tools/PROTOCOL.md`).

## Options

| Option | heddle files | Size | Images | Risk |
|---|---|---|---|---|
| A. MCP client in heddle, both builds | 8 to 12 | about 1,200 to 1,800 lines | still needs D | high |
| B. Built-in tool in heddle's repository | about 4 | about 300 lines | no | breaks public hygiene: our paths enter a public repository |
| C. Our plugin, loaded by a profile row | none | about 200 lines on our side | through a user-message workaround | low for heddle |
| D. Images in tool results (core) | about 10 | about 250 code, 250 test lines | yes, all adapters | medium |

## Recommendation (inference)

**C now, D as the single request to [hd].** C is a dependency-free `_tools_/heddle-plugin/computer-use.mjs` in our
repository: a small stdio MCP client to our server that registers the four tools, plus a `model/request` listener
that adds the final screenshot as a user-message image. That image is outside the transcript and compaction can
drop it; D removes that and serves every heddle tool. The row lives in the user's own `$HEDDLE_HOME` profile, so
nothing machine-specific enters heddle. A, a general MCP client, waits until a second MCP server matters.

Unchecked: that an absolute-path `.mjs` plugin loads, which heddle's verifier asserts only for its own fixture; and
whether Rust outside processes can rewrite requests. Measured elsewhere: Claude accepts images inside `tool_result`
([Claude tool](../model-capabilities/claude-computer-tool.md)), so D is wire-feasible for the Anthropic adapters.
