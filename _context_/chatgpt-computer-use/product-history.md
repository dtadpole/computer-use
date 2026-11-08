---
title: History of OpenAI computer use from Operator to ChatGPT Work
created: 2026-11-01T09:13:00Z
modified: 2026-11-01T09:38:00Z
level: L1
version: 1.1.0
description: The 2025-2026 lineage of CUA and Operator, ChatGPT agent and Atlas agent mode, and their retirement into ChatGPT Work, from OpenAI primary documents
status: unverified
grounded_in:
  - source: cdn.openai.com/operator_system_card.pdf (fetched 2026-11-01)
  - source: cdn.openai.com/pdf/4375e605-f9a6-438d-bcc8-190599c183a6/o3_cua_system_card.pdf (fetched 2026-11-01)
  - source: cdn.openai.com/pdf/839e66fc-602c-48bf-81d3-b21eacc3459d/chatgpt_agent_system_card.pdf (fetched 2026-11-01)
  - source: web.archive.org/web/20251217145527/openai.com/index/computer-using-agent/ (Internet Archive capture, fetched 2026-11-01)
  - source: web.archive.org/web/20260108213932/openai.com/index/introducing-operator/ (Internet Archive capture, fetched 2026-11-01)
  - source: web.archive.org/web/20250803031233/openai.com/index/introducing-chatgpt-agent/ (Internet Archive capture, fetched 2026-11-01)
  - source: web.archive.org/web/20260102082415/openai.com/index/introducing-chatgpt-atlas/ (Internet Archive capture, fetched 2026-11-01)
  - source: web.archive.org/web/20261022155906/openai.com/index/hardening-atlas-against-prompt-injection/ (Internet Archive capture, fetched 2026-11-01)
  - source: web.archive.org/web/20250925222824/operator.chatgpt.com/ (Internet Archive capture, fetched 2026-11-01)
  - source: web.archive.org/web/20261012103042/help.openai.com/en/articles/11752874-chatgpt-agent (Internet Archive capture, fetched 2026-11-01)
  - source: web.archive.org/web/20260625055336/help.openai.com/en/articles/12628199-using-ask-chatgpt-sidebar-and-chatgpt-agent-on-atlas (Internet Archive capture, fetched 2026-11-01)
  - source: web.archive.org/web/20261030084504/help.openai.com/en/articles/6825453-chatgpt-release-notes (Internet Archive capture, fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use-integration (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/browser (fetched 2026-11-01)
  - source: learn.chatgpt.com/llms.txt (fetched 2026-11-01)
  - source: deepnoodle.ai/atlas/timeline/2025-01-23-openai-operator (secondary, fetched 2026-11-01)
  - source: trustvector.dev/agents/chatgpt-agent (secondary, fetched 2026-11-01)
---

# History of OpenAI computer use

Sources are OpenAI primary documents; web pages are cited as Internet Archive captures because openai.com and
help.openai.com return HTTP 403.

## Timeline

| Date | Event | Source |
|---|---|---|
| 2025-01-23 | Operator research preview on the CUA model, for Pro users in the U.S. | [op], [cua] |
| 2025-03-11 | API research preview, model `computer-use-preview` (tiers 3–5), tool `computer_use_preview` | [oscard] §4.7, [int] |
| 2025-05-23 | Operator moves to an o3-based CUA; "The API version will remain based on 4o" | [o3op] |
| 2025-07-17 | ChatGPT agent "combines the strengths of deep research and Operator"; Operator site to sunset in "a few more weeks" | [agcard] §1, [agpost] |
| by 2025-09-25 | operator.chatgpt.com redirects to agent mode (HTTP 200 until 2025-09-01) | [wb-op] |
| 2025-10-21 | Atlas browser for macOS; agent mode in preview for Plus, Pro and Business | [atlas] |
| 2025-12-22 | Atlas agent checkpoint adversarially trained on attacks from automated red teaming, rolled out to all users | [atlas-pi] |
| 2026-07-09 | ChatGPT Work launches with a new desktop app and built-in browser; Atlas deprecation announced | [relnotes] |
| 2026-07-20 (capture) | Help center says "ChatGPT agent is no longer available" (absent on 2026-07-11) | [help-agent] |
| 2026-08-09 | Atlas "scheduled to stop working" | [relnotes] |

## CUA and Operator

CUA paired GPT-4o vision with reasoning trained by reinforcement learning. It added each screenshot to its context
and acted with a virtual mouse and keyboard [cua]. Benchmarks with their step limits, confirmations, takeover,
watch mode, refusals and the injection monitor are in [Operator system card](system-card-operator.md).

## ChatGPT agent

One virtual computer held a visual browser, a text browser, a terminal, direct API access and connectors, so a
downloaded file could be processed in the terminal and viewed in the visual browser [agpost]. Launch restrictions
and measured rates are in [ChatGPT agent system card](system-card-chatgpt-agent.md).

## Atlas agent mode

Agent mode acted inside the user's own browser, not a remote one, and could not run code, download files or
install extensions [atlas]. Logged-out mode used no pre-existing cookies [help-atlas].

## Status in 2026

ChatGPT agent is retired. The help center points users to ChatGPT Work for multi-step tasks and to the cloud
browser for web workflows [help-agent]. Atlas was deprecated "as we bring browser-based agentic capabilities into
ChatGPT and Codex" [relnotes] and is absent from the docs index [learn-idx]. The successors are ChatGPT Work's
cloud browser (confirmations, take over, secure sign-in) and the desktop built-in Browser [br]; see
[product surfaces](product-surfaces.md).

The release notes contain no agent-mode retirement entry. Press claims of a pull in "early August 2026"
[press-dn-op] and of an "Agent Mode v2" on 2026-07-09 [press-tv] are not supported by OpenAI documents.

[oscard]: https://cdn.openai.com/operator_system_card.pdf
[o3op]: https://cdn.openai.com/pdf/4375e605-f9a6-438d-bcc8-190599c183a6/o3_cua_system_card.pdf
[agcard]: https://cdn.openai.com/pdf/839e66fc-602c-48bf-81d3-b21eacc3459d/chatgpt_agent_system_card.pdf
[cua]: https://web.archive.org/web/20251217145527/https://openai.com/index/computer-using-agent/
[op]: https://web.archive.org/web/20260108213932/https://openai.com/index/introducing-operator/
[agpost]: https://web.archive.org/web/20250803031233/https://openai.com/index/introducing-chatgpt-agent/
[atlas]: https://web.archive.org/web/20260102082415/https://openai.com/index/introducing-chatgpt-atlas/
[atlas-pi]: https://web.archive.org/web/20261022155906/https://openai.com/index/hardening-atlas-against-prompt-injection/
[wb-op]: https://web.archive.org/web/20250925222824/https://operator.chatgpt.com/
[help-agent]: https://web.archive.org/web/20261012103042/https://help.openai.com/en/articles/11752874-chatgpt-agent
[help-atlas]: https://web.archive.org/web/20260625055336/https://help.openai.com/en/articles/12628199-using-ask-chatgpt-sidebar-and-chatgpt-agent-on-atlas
[relnotes]: https://web.archive.org/web/20261030084504/https://help.openai.com/en/articles/6825453-chatgpt-release-notes
[int]: https://developers.openai.com/api/docs/guides/tools-computer-use-integration
[br]: https://learn.chatgpt.com/docs/browser
[learn-idx]: https://learn.chatgpt.com/llms.txt
[press-dn-op]: https://deepnoodle.ai/atlas/timeline/2025-01-23-openai-operator
[press-tv]: https://trustvector.dev/agents/chatgpt-agent
