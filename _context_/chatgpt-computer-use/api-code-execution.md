---
title: Computer use through code execution
created: 2026-11-01T09:16:00Z
modified: 2026-11-01T09:40:00Z
level: L1
version: 1.1.0
description: The exec_js and exec_py function-tool pattern OpenAI recommends for GPT-6 Astra, its runtime contract and its safety requirements
status: unverified
grounded_in:
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use-integration (fetched 2026-11-01)
  - source: github.com/openai/openai-cua-sample-app README (fetched 2026-11-01)
---

# Computer use through code execution

The model gets an ordinary strict function tool whose `code` argument is a script; one call can combine
actions, loops, conditionals and DOM inspection, and request screenshots to check itself [int]. OpenAI
recommends this path for GPT-6 Astra, and every code-execution sample uses `gpt-6-astra` [tcu]. OpenAI builds
its own loop around models writing code, but "OpenAI products use their own runtimes and additional controls"
[sample].

## Tool definition (JavaScript variant, abridged)

```json
{ "type": "function", "name": "exec_js",
  "parameters": { "type": "object",
    "properties": { "code": { "type": "string" } },
    "required": ["code"], "additionalProperties": false },
  "strict": true }
```

The description lists:
- Playwright's `browser`, `context` and `page`
- `console.log(value)` and `display(base64Image)`
- variables on `globalThis` and top-level await
- a screenshot before acting, and a 1440x900 viewport [tcu]

`exec_py` lists `pyautogui`, `time`, `log(value)` and `display(PIL_image)`, and asks for PyAutoGUI's fail-safe
to stay on. The Java sample's `exec_py` instead offers Playwright in "a persistent, isolated browser runtime"
[tcu].

## Execution-service contract (application-defined)

| Requirement | Service provides | Source |
|---|---|---|
| Request | `{ session_id, language, code }` | [int] |
| Session | Same environment and variables per `session_id` | [int] |
| Output | `{ output }` of `input_text` or `input_image` items, images with `detail: "original"` | [int] |
| Controls | Caller authentication, execution deadlines, resource and network limits | [int] |

The Python runtime also provides Pillow. On Linux, the browser and PyAutoGUI share one X11 display, with a
screenshot utility such as `scrot`. The JavaScript runtime must set the viewport to 1440×900 [int].

Results return as `function_call_output` with the original `call_id`. `display` belongs to the runtime, which
must not print image payloads as text [int]. The endpoint is the developer's, not OpenAI-hosted [tcu].

## Loop details in the samples

- Throw if `response.status` is not `completed` (the JavaScript, Python, Go and Ruby samples) [tcu].
- Stop when no function calls remain and a message's `phase` is not `commentary` [tcu]. No guide explains this
  in prose. **Inference:** commentary messages are interim updates, and stopping on them would end runs early.
- Abort after 20 responses. Only the JavaScript sample sets reasoning effort `low` [tcu].
- Clarification: "surface that question to the user before continuing" [int]. The Java sample adds an
  `ask_user` function [tcu].
- The adapter asks before every script ("Run this code in the isolated runtime? Type yes:"). On decline it
  returns the `input_text` "The user declined this execution." [int].
- The guide calls this approval step a conservative demo. Production must enforce action-specific consent in
  the helpers and runtime, because one script can perform many actions [int].

## Isolation requirements

Run generated code in a disposable least-privilege container or VM, separate from the API client and its
credentials; Node `vm` and restricted Python globals are not security boundaries; enforce limits inside the
runtime, because "The adapter's 30-second timeout only limits how long the client waits" [int]. The sample
app gives no OS sandbox, and its Python agent drives the real mouse and keyboard [sample].

[tcu]: https://developers.openai.com/api/docs/guides/tools-computer-use
[int]: https://developers.openai.com/api/docs/guides/tools-computer-use-integration
[sample]: https://github.com/openai/openai-cua-sample-app
