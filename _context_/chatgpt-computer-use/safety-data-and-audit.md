---
title: Screenshot data, credentials and audit for computer use
created: 2026-11-01T09:17:00Z
modified: 2026-11-01T09:50:00Z
level: L1
version: 1.1.0
description: How OpenAI documents retention of screenshots and browser activity, credential handling and the limits of audit records for computer use
status: unverified
grounded_in:
  - source: learn.chatgpt.com/docs/computer-use (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/chrome-extension (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/agents-api/tools/computer-use (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/browser (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/appshots (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/agent-approvals-security (fetched 2026-11-01)
  - source: github.com/openai/openai-cua-sample-app (fetched 2026-11-01)
---

# Screenshot data, credentials and audit

## Screenshots and activity

| Surface | Documented handling | Source |
|---|---|---|
| Desktop Computer Use | ChatGPT data controls apply to its screenshots | [cu] |
| Extension | No separate complete action record; stored only when in chat context (page text, screenshots, tool calls) | [ext] |
| Local Work | Screenshots, excerpts, browser content may go to OpenAI; local execution is not device-only inference | [wls] |
| Work Cloud | Conversations follow workspace retention (deletion generally within 30 days); execution snapshots follow a separate lifecycle; compliance logs kept 30 days | [wcs] |
| Local access with Work Cloud | No strict zero data retention | [wls], [wcs] |
| API and SDK | Screenshots and page text go to OpenAI; `store: false` does not remove every retention; image inputs have exceptions | [tcu] |
| Agents API | Screenshots excluded from output by default; show only to authorised users; keep out of logs | [agt] |
| Appshots | Frontmost-window image and available text are shared with ChatGPT; stored locally in the session file | [as] |

## Credentials

- Cloud browser: secure form, credentials never visible to the model or stored by ChatGPT; never paste passwords
  in chat [br].
- Agents API: dedicated submission event; values excluded from model input and history; mask, never log, no
  automatic retries [agt].
- Docs advise avoiding secrets unless the user is present to approve each step [cu].

## Audit and observability

- Docs warn not to assume any customer export covers every shell command, browser interaction, approval or file
  operation [wcs], [wls].
- Browser Use can emit OpenTelemetry events for site-access, upload and download decisions with their source;
  these are not a complete action record [wls].
- Local Codex OTel is opt-in ("off by default") and logs tool approval decisions with their source and tool
  results; prompts are redacted by default [aas].
- SDK diagnostics carry API, stage, reason, call ID, member and duration, never raw errors, page text, arguments
  or images [drv].
- Agents API history records sign-in requests and accepted responses without credential values, but "Origin
  approvals have no dedicated request or response history items" [agt].
- The sample app keeps workspaces, screenshots and replays in an ignored `data/` directory, viewed as Replay JSON
  and a screenshot timeline; its SDK examples save one final image, replaced each run [sample].

**Inference:** OpenAI keeps full trajectories inside conversation context rather than a separate audit log, and
hosted origin decisions must be logged by the application; a self-built system should store a redacted,
step-indexed trajectory (action, pre and post screenshot hashes, approval decision) with its own retention policy.

[cu]: https://learn.chatgpt.com/docs/computer-use
[br]: https://learn.chatgpt.com/docs/browser
[ext]: https://learn.chatgpt.com/docs/chrome-extension
[as]: https://learn.chatgpt.com/docs/appshots
[wls]: https://learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security
[wcs]: https://learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security
[aas]: https://learn.chatgpt.com/docs/agent-approvals-security
[tcu]: https://developers.openai.com/api/docs/guides/tools-computer-use
[drv]: https://developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers
[agt]: https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use
[sample]: https://github.com/openai/openai-cua-sample-app
