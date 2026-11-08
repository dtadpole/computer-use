---
title: OpenAI SDK ComputerToolset driver contract
created: 2026-11-01T09:16:00Z
modified: 2026-11-01T09:35:50Z
level: L1
version: 1.1.0
description: Method names, approval callbacks, bounds, cancellation and recovery options of the OpenAI SDK computer helper and Responses tool runner
status: unverified
grounded_in:
  - source: developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use-integration (fetched 2026-11-01)
---

# SDK ComputerToolset driver contract

Packages: Node `openai@7.33.0` (`import OpenAI, { ComputerToolset } from "openai"`), Python `openai==3.31.0`
(`ComputerToolset`, `AsyncComputerToolset`, `ComputerDriver`, `AsyncComputerDriver`) [tcu], [drv].

## Driver methods

Each action method receives one generated action object with snake-case fields, returns nothing and must raise
when it cannot act [drv]. The sample-field column comes from code samples, not the driver reference [tcu], [int].

| Method | Action carries [drv] | Sample fields |
|---|---|---|
| `click` | coordinates, button, held keys | `x`, `y`, `button`, `keys` |
| `double_click` | coordinates, held keys | `x`, `y` |
| `drag` | path, held keys | `path` |
| `keypress` | key combination | `keys` (`["CTRL", "A"]`) |
| `move` | pointer coordinates | `x`, `y` |
| `scroll` | coordinates, `scroll_x`, `scroll_y` | same |
| `type` | text for the focused control | `text` |
| `wait` | request to let the environment settle | none; sample sleeps 2 s |
| `screenshot` | no argument; returns `computer_screenshot` with `image_url` (data URL allowed) or `file_id` | |

Python pairs synchronous methods with `ComputerToolset` and `async def` with `AsyncComputerToolset` [drv].
Actions run once, in order, with no retry, then the helper captures the final screenshot; it never reads local
files, and overlapping calls get a busy error [drv].

## Entry points and options

| API | Behaviour | Source |
|---|---|---|
| `tools.run(client, params, opts)` | Computer-only loop; Python takes keywords (`before_action=`, `max_steps=`); no per-request usage | [drv], [tcu] |
| `tools.execute(call)` | One call; Node's `ComputerCallInput` admits `actions`-array calls omitting `pending_safety_checks` | [drv] |
| `beforeAction` / `before_action` | Checks each action, including the final screenshot; must approve explicitly | [drv] |
| `approveSafetyChecks` / `approve_safety_checks` | Must return exactly true for all pending checks; missing or declined stops the run | [drv] |
| `maxSteps` / `max_steps` | Default 20 requests; final request cannot start effects | [drv] |
| `signal` / `cancelled` | Cooperative; second driver-method argument and approval-callback context; cannot undo effects | [drv] |
| `close()` | Refuses new work; status `closed` or `draining`; never closes your browser or desktop | [drv] |

Approval covers fixed arguments only and does not freeze screen or focus; drivers must rebind to the target at
execution, as the pickup sample's bounding-box recheck does [drv], [tcu].

## ResponsesToolRunner extras

Pass the helper as the runner's `computer` option to mix with functions, web and file search, code
interpreter, image generation (rejects `store: false`) and remote MCP; Node puts computer callbacks in
`computerOptions`, Python passes `run` keywords [drv]. Extras: per-request usage via `onDiagnostic`; optional
`eager` streaming execution; `contextBudget` or native `context_management`; `appendUserText` guidance; a durable
`ledger` resumable only from completed boundaries [drv]. After an interrupted eager run,
`ResponsesToolRunnerError.attemptedCallIds` and `completedCallIds` (Python snake_case) hold call IDs only; read
real state before retrying [drv].

## Desktop demos

Isolated-desktop examples run a Linux guest: a VM on Apple silicon, Docker on x86-64 Linux [drv]. The
visual desktop demo lets you "see and control the desktop in your browser" [int]; setup in
[isolation](safety-isolation-and-approvals.md), hand-off rules in [confirmation](safety-confirmation-policy.md).

[tcu]: https://developers.openai.com/api/docs/guides/tools-computer-use
[drv]: https://developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers
[int]: https://developers.openai.com/api/docs/guides/tools-computer-use-integration
