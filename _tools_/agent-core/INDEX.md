---
title: agent-core
created: 2026-11-01T10:11:08Z
modified: 2026-11-06T04:11:04Z
version: 0.6.2
description: The computer-use agent core - keys, site filter, launch gate, run control, schema validation, policy, consent controllers, inspector, trajectory, the scripted model, a fake environment and the loop; the claude-gateway adapter and the command line.
grounded_in:
  - source: _designs_/system-architecture/INDEX.md@0.8.2 (approved at 687f4336b, D-015)
---

# `agent-core`

Instance of [`_tools_`](../INDEX.md), written by cu-developer-one to the approved
[design](../../_designs_/system-architecture/INDEX.md). Node 24 ES modules, no npm dependencies. Other components
import only [`lib.mjs`](lib.mjs); agent-core imports no environment, live view or fixture code (D-012).

| File | Owns | Design |
|---|---|---|
| [`keys.mjs`](keys.mjs) | `CANONICAL_KEYS`, `normalizeKey`, `parseKeyCombo` | [keys-and-coordinates](../../_designs_/system-architecture/keys-and-coordinates.md) |
| [`sites.mjs`](sites.mjs) | `createSitePolicy`, `isFixedDenied`, canonical loopback hosts | [site-filter](../../_designs_/system-architecture/site-filter.md) |
| [`resource-gate.mjs`](resource-gate.mjs) | `resourceGate`: the D-014 registry and the D-005 memory floor | [environment-behaviour](../../_designs_/system-architecture/environment-behaviour.md) |
| [`retry.mjs`](retry.mjs) | `RETRY`, `transientInput`, `transientCapture`: which transient helper errors are retried, how often (CU-56) | [input-and-targets](../../_designs_/desktop-extension/input-and-targets.md) |
| [`control.mjs`](control.mjs) | `createRunControl`: states, tokens, senders, consent requests | [live-control](../../_designs_/system-architecture/live-control.md), [run-tokens](../../_designs_/system-architecture/run-tokens.md) |
| [`actions.mjs`](actions.mjs) | `validateBatch`: the canonical schema, whole-batch refusal by name | [action-schema](../../_designs_/system-architecture/action-schema.md) |
| [`policy.mjs`](policy.mjs) | `createPolicy` (allow, confirm, block, hand-off), pre-approvals, the approval store | [action-policy](../../_designs_/system-architecture/action-policy.md) |
| [`consent.mjs`](consent.mjs) | the `unattended`, `api` and `tty` controllers | [consent-authority](../../_designs_/system-architecture/consent-authority.md) |
| [`inspect.mjs`](inspect.mjs) | the model-independent page-text inspector | [untrusted-content](../../_designs_/system-architecture/untrusted-content.md) |
| [`trajectory.mjs`](trajectory.mjs) | the run directory, redaction, build identity, retention, replay text | [trajectory](../../_designs_/system-architecture/trajectory.md) |
| [`adapter-scripted.mjs`](adapter-scripted.mjs) | the scripted model: plans as data or functions | [model-adapters](../../_designs_/system-architecture/model-adapters.md) |
| [`adapter-claude.mjs`](adapter-claude.mjs) | the claude-gateway adapter: native toolset (members mapped, three disabled by `configs`) or function mode, cache breakpoints and prices (D-016), key read per request | [anthropic-mapping](../../_designs_/system-architecture/anthropic-mapping.md) |
| [`local-config.mjs`](local-config.mjs) | the machine-local config, optional JSON at `$CU_CONFIG` or `~/.config/computer-use/config.json` (missing is `{}`, invalid JSON a named error): model aliases (`resolveModel`, `isToolsetModel`, `modelPricing`), `defaultModel`, tool paths (`localPath`: variable, config, home-relative default); real model ids and user paths stay out of the repository | [model-adapters](../../_designs_/system-architecture/model-adapters.md) |
| [`adapter-responses.mjs`](adapter-responses.mjs) | the responses adapter (GA computer tool, safety checks, `previous_response_id`), tested on recorded fixtures only | [model-adapters](../../_designs_/system-architecture/model-adapters.md) |
| [`fake-env.mjs`](fake-env.mjs) | a test double of the driver interface | [environment-driver](../../_designs_/system-architecture/environment-driver.md) |
| [`loop.mjs`](loop.mjs) | `runTask`: the loop, bounds, cancel, statuses, the result | [agent-loop](../../_designs_/system-architecture/agent-loop.md), [run-outcomes](../../_designs_/system-architecture/run-outcomes.md) |
| [`exclusions.mjs`](exclusions.mjs) | desktop hard exclusions by app and window, add-only run config (C1) | [app-policy](../../_designs_/desktop-extension/app-policy.md) |
| [`app-approvals.mjs`](app-approvals.mjs) | the always app approvals: one mode-600 file, read at every check, revocable, corrupt fails closed, excluded never granted (C3) | [app-policy](../../_designs_/desktop-extension/app-policy.md) |
| [`app-policy.mjs`](app-policy.mjs) | desktop policy: exclusions, auth hand-off, per-app scope and `new_app`, the browser classes on AX targets, copy, cut and paste allowed (C2; C9 reverted by D-031); per-app pre-approvals bind to their app | [app-policy](../../_designs_/desktop-extension/app-policy.md) |
| [`lib.mjs`](lib.mjs) | the library face; also exclusions, app policy and app approvals | [layout](../../_designs_/system-architecture/layout-and-ownership.md) |
| [`run.mjs`](run.mjs) | `startRun`: the composition root; loads the environment and the live view by path at call time and hands the caller the view and control URLs while the run is live; desktop runs (`macos-desktop`, `apps`) refused unless the local-input pause is armed and an app is named (C6); `onEvent` (scrubbed event lines), `started`, opt-in `keepLiveView` with `replayUrl` and `closeLiveView()` | [live-control](../../_designs_/system-architecture/live-control.md), [agent-core-changes](../../_designs_/desktop-extension/agent-core-changes.md) |
| [`cli.mjs`](cli.mjs) | `run` (on `startRun`; URLs on stderr only; `--env macos-desktop --app`), `replay`, `prune`, `control-link`, `apps list \| revoke` (C6) | [run-outcomes](../../_designs_/system-architecture/run-outcomes.md), [app-policy](../../_designs_/desktop-extension/app-policy.md) |

Tests: [`_tests_/agent-core/`](../../_tests_/agent-core/INDEX.md). A run, never in a blocking call:

```bash
node _tools_/agent-core/cli.mjs run --seat cu-<seat> --task "..." --start-url http://127.0.0.1:<port>/tasks/<id>/ \
  --model scripted --plan plan.json --consent unattended
```
