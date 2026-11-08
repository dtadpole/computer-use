---
title: Code layout and ownership
created: 2026-11-01T09:24:10Z
modified: 2026-11-05T16:23:12Z
level: L1
version: 0.6.1
description: Where each component of computer-use lives in the project tree, which seat writes it, and which runtime paths stay outside git.
status: unverified
grounded_in:
  - source: shared/_conventions_/core-conventions/type-instance-trees.md@1.8.0
  - source: _context_/team-operations/working-model.md@1.0.0
  - source: TEAM.yaml@1.0.0
---

# Code layout and ownership

Registered types only; every folder carries an `INDEX.md`; instance names are 2-4 kebab words. Code is Node 24
ES modules with no npm dependencies, flat inside its instance as in the vendored [`browser-use`](../../_vendor_/browser-use/INDEX.md).

| Path (under the project) | Holds | Writer |
|---|---|---|
| `_designs_/system-architecture/` | this contract | cu-developer-one |
| `_tools_/agent-core/` | schema, loop, adapters, policy, consent, trajectory, run control, fake environment, `cli.mjs`, `lib.mjs` | cu-developer-one |
| `_environments_/chrome-browser/` | the browser driver over CDP | cu-developer-two |
| `_tools_/live-view/` | the 127.0.0.1 watch and control page and replay timeline; a tool, not a `_services_` instance, because it lives only for one run (D-009) | cu-developer-two |
| `_tools_/fixture-site/` | `server.mjs`, `tasks.mjs`, `pages.mjs`, `store.mjs`, `judge.mjs`: task and injection pages, the token-guarded state endpoint, scripted plans | cu-verifier |
| `_tools_/verify-kit/` | `memoryGate()` (D-005), `throwawayProfile()` and its removal | cu-verifier |
| `_tests_/agent-core/`, `_tests_/chrome-browser/`, `_tests_/live-view/`, `_tests_/fixture-site/`, `_tests_/verify-kit/` | `node --test` unit suites | the code's writer |
| `_verifiers_/<claim>/` | one claim per ULTIMATE_GOAL row | cu-verifier |
| `_evaluators_/task-suite/` | unattended suite runner, `results.jsonl` per model and build | cu-verifier |
| `_tools_/computer-use-mcp/` | the M4 tool server (a DSH consent plugin only if D-013's later channel is built) | assigned at M4 |
| `_environments_/<desktop>/` | not created before owner approval (D-006) | assigned at M5 |

`_tools_/INDEX.md` and `_tests_/INDEX.md` are shared tables: each writer adds its own rows and keeps the others'.
Dependencies point one way: environments, live view and the MCP server import `agent-core`'s `lib.mjs` (types,
`CANONICAL_KEYS`, `isFixedDenied`, `resourceGate`, run control); `agent-core` imports none of them and reaches an
environment only through the [driver interface](environment-driver.md). `chrome-browser` reuses `browser-use` by
import, never by editing it.

**Judge and judged stay apart (D-012).** The fixture site and `verify-kit` import nothing from `agent-core` or the
environments, and those never import them; scripted plans are data. Verifiers run the system only through its public
entry points (`lib.mjs`, `cli.mjs`, the MCP server) and judge with their own code.

## Runtime paths, never in git

| Path | Content |
|---|---|
| `$CU_HOME` (default `~/.computer-use/`, mode 700) | `runs/<run-id>/` trajectories, `approvals.json` (only if persistent approvals are enabled) |
| `/tmp/<seat>-chrome-*` | throwaway Chrome profiles (seat keys begin `cu-`, which meets D-005), removed on close |
| `/tmp/cu-browsers/` | the one browser registry every [cu] Chrome launch honours for the two-browser cap (D-014) |
| `~/.heddle/keys/conclave.api.key` | read by the Claude adapter per request, never copied (D-007) |
| `$CU_CONFIG` (default `~/.config/computer-use/config.json`) | the machine's optional local config: model aliases with their real gateway ids, toolset flags and prices, the default model, and this machine's tool paths (DSH, heddle checkout, key file, node, project), read by [`local-config.mjs`](../../_tools_/agent-core/local-config.mjs); a missing file is `{}` |

Tests and verifiers set `CU_HOME` to a temporary directory and remove it.
