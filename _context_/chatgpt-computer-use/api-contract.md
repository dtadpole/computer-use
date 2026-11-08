---
title: OpenAI computer-use API contract overview
created: 2026-11-01T09:14:00Z
modified: 2026-11-01T09:40:00Z
level: L1
version: 1.1.0
description: The developer integration paths for computer use and the loop invariants every path shares, with links to the detailed contract articles
status: unverified
grounded_in:
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use-integration (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/agents-api/tools/computer-use (fetched 2026-11-01)
---

# OpenAI computer-use API contract overview

## Integration paths

| Path | The model emits | Who runs the environment | Detail |
|---|---|---|---|
| Responses `computer` tool | `computer_call` with batched `actions[]` | Developer | [computer tool](api-computer-tool.md), [actions](api-action-handling.md) |
| Code execution | `function_call` with a script for `exec_js` or `exec_py` | Developer runtime | [code execution](api-code-execution.md) |
| Own UI tools | `function_call`, answered with `function_call_output`; or remote MCP, where the Responses API calls the server and returns `mcp_call` | Developer; the app handles only `mcp_approval_request` for MCP | [tcu-int] |
| SDK `ComputerToolset` | Computer calls dispatched to a driver | Developer driver | [computer toolset](api-sdk-computer-toolset.md) |
| SDK `BrowserToolset` | Browser function calls such as `read_page`, `click` | Developer driver | [browser toolset](api-sdk-browser-toolset.md) |
| Agents API `computer_use` | `computer_use_call` activity items, plus `computer_use_approval_request` | OpenAI-hosted browser | [hosted](api-agents-hosted.md), [agt] |

For GPT-6 Astra OpenAI recommends code execution; the `computer` tool remains a supported alternative
[tcu]. The legacy preview tool is covered in [migration](api-migration.md).

## Loop invariants (all developer-run paths)

1. Send the task with the tool enabled; describe the result wanted [tcu].
2. The first call may contain only a `screenshot` action: capture and return without changing the UI [tcu].
3. `status: "completed"` on a call means generation finished; the application must still execute it [tcu].
4. Check permissions before each action. In a batch, stop before the first action that needs confirmation. "The
   model's request to act is not user permission" [tcu-int].
5. Execute permitted actions in order, then capture one updated screenshot [tcu].
6. Return output with the matching `call_id`; continue with `previous_response_id` [tcu].
7. Stop if the response is incomplete or failed, or if a step or time limit is reached. "Do not execute a
   partially generated action" [tcu-int].
8. Repeat until no `computer_call` remains; inspect the rest for an answer, a help request, or another tool [tcu].
9. Verify the real outcome in the application, not the model's final message [tcu].

## State model

The API conversation and the execution environment have separate state: continuing a response does not
restore a browser session, login or runtime variables, so the application keeps the environment alive and
preserves calls and outputs [tcu].

## Bounds

Set step, time or cost limits and support cancellation [tcu]. In the SDK runners, `maxSteps` / `max_steps`
defaults to 20 requests, and the final allowed request cannot start new effects [drv]. The guide's
code-execution loops stop after 20 responses [tcu]. Screenshots count as image input [tcu]. "Screenshot size
affects input tokens and cost" [drv].

## Evaluating designs

For your own UI tools, the guide says to compare designs on task success, time to completion, number of model
turns, recovery from unexpected UI state and adherence to permission rules [tcu-int].

[tcu]: https://developers.openai.com/api/docs/guides/tools-computer-use
[tcu-int]: https://developers.openai.com/api/docs/guides/tools-computer-use-integration
[drv]: https://developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers
[agt]: https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use
