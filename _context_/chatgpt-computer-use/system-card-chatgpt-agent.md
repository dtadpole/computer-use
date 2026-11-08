---
title: ChatGPT agent system card and Atlas agent mode, primary-source digest
created: 2026-11-01T09:38:42Z
modified: 2026-11-01T09:38:42Z
level: L1
version: 1.0.0
description: What the ChatGPT agent System Card, launch post, help article and Atlas documents say about tools, watch mode, takeover, prompt-injection rates, refusals, benchmarks and the 2026 retirement
status: unverified
grounded_in:
  - source: cdn.openai.com/pdf/839e66fc-602c-48bf-81d3-b21eacc3459d/chatgpt_agent_system_card.pdf (fetched 2026-11-01)
  - source: web.archive.org/web/20250803031233/openai.com/index/introducing-chatgpt-agent/ (Internet Archive capture, fetched 2026-11-01)
  - source: web.archive.org/web/20261012103042/help.openai.com/en/articles/11752874-chatgpt-agent (Internet Archive capture, fetched 2026-11-01)
  - source: web.archive.org/web/20250723082644/help.openai.com/en/articles/11752874-chatgpt-agent (Internet Archive capture, fetched 2026-11-01)
  - source: web.archive.org/web/20260625055336/help.openai.com/en/articles/12628199-using-ask-chatgpt-sidebar-and-chatgpt-agent-on-atlas (Internet Archive capture, fetched 2026-11-01)
  - source: web.archive.org/web/20260102082415/openai.com/index/introducing-chatgpt-atlas/ (Internet Archive capture, fetched 2026-11-01)
  - source: web.archive.org/web/20261030084504/help.openai.com/en/articles/6825453-chatgpt-release-notes (Internet Archive capture, fetched 2026-11-01)
---

# ChatGPT agent and Atlas agent mode: primary-source digest

PDF from cdn.openai.com; web pages via the Internet Archive, because openai.com and help.openai.com return HTTP 403. Predecessor and timeline: [Operator system card](system-card-operator.md), [history](product-history.md).

## Environment

| Item | Published fact | Ref |
|---|---|---|
| Model | Agentic model "in the same family as OpenAI o3" | [agcard] §1 |
| Tools | Visual browser, text browser, terminal, direct API access, connectors; one virtual computer shared across tools | [agpost] An agent that works for you |
| Terminal network | "limited to GET requests to download images or certain datasets" | [agcard] §3.1.2.5 |
| Memory | Disabled at launch against exfiltration | [agcard] §3.1.2.6 |
| Perception | "Screenshots capture the window in the virtual browser where the task is active." | [help-agent] |

## Human-in-the-loop controls

| Control | Rule | Ref |
|---|---|---|
| Confirmation | Before "finalizing actions that affect the state of the world"; user reviews, approves or redirects | [agcard] §3.1.2.3, §3.2.2.1 |
| Watch mode | Visual browser in a sensitive context, e.g. "logged into an email or banking account", for the rest of the trajectory; pauses when the user is inactive or leaves the conversation | [agcard] §3.1.2.4 |
| Takeover | Login pauses the task; the user selects Take over browser; "screenshots are not captured"; afterwards the agent "attempts to continue from the prior workflow state" | [help-agent] |
| Asking | Pauses "for clarification or confirmation when needed"; connectors read-only at launch | [help-agent], [help-agent-25] |
| Blocklist | Covers the browser and connectors | [help-agent], [agcard] §3.3.2.3 |

## Measured rates (model only, not full stack)

| Evaluation | Agent | Operator 4o / o3 | Ref |
|---|---|---|---|
| Ignores irrelevant instructions, text browser | 99.5% | — | [agcard] Table 12 |
| Same, visual browser | 95% | 82% / 89% | [agcard] Table 12 |
| Resists in-context exfiltration | 78% | 75% / 80% | [agcard] Table 12 |
| Resists active exfiltration | 67% | 58% / 75% | [agcard] Table 12 |
| Confirmation recall | 91.0% | 90.8% / 92.1% | [agcard] Table 13 |
| Critical confirmations: permissions / communications / payments | 100.0% / 99.9% / 100.0% | — | [agcard] Table 13 |
| Refusal: privacy / gambling-type / transfers | 98.5% / 97.0% / 89.0% | transfers only: 92% / 98% | [agcard] Table 14 |

No rates are published for the injection monitors [agcard] §3.1.2.2.

## Benchmarks

| Benchmark | Agent | Comparison | Ref |
|---|---|---|---|
| WebArena | 65.4% | CUA 4o 58.1%, CUA o3 62.9%, human 78.2% (chart data) | [agpost] |
| BrowseComp | 68.9% | Deep research 51.5% | [agpost] |
| HLE | 41.6 pass@1; 44.4 with up to eight parallel attempts | — | [agpost] |
| SpreadsheetBench | 45.5% with .xlsx | Copilot in Excel 20.0% | [agpost] |

## Atlas and status

| Date | Fact | Ref |
|---|---|---|
| 2025-10-21 | Agent mode cannot run code, download files, install extensions or reach other apps; pauses on financial sites | [atlas] |
| — | Logged-out mode: "won't use any pre-existing cookies" | [help-atlas] |
| 2026-07-09 | ChatGPT Work launches; Atlas "scheduled to stop working on August 9, 2026" | [relnotes] |
| 2026-07-20 (capture) | "ChatGPT agent is no longer available"; points users to Work and cloud browser | [help-agent] |

[agcard]: https://cdn.openai.com/pdf/839e66fc-602c-48bf-81d3-b21eacc3459d/chatgpt_agent_system_card.pdf
[agpost]: https://web.archive.org/web/20250803031233/https://openai.com/index/introducing-chatgpt-agent/
[help-agent]: https://web.archive.org/web/20261012103042/https://help.openai.com/en/articles/11752874-chatgpt-agent
[help-agent-25]: https://web.archive.org/web/20250723082644/https://help.openai.com/en/articles/11752874-chatgpt-agent
[atlas]: https://web.archive.org/web/20260102082415/https://openai.com/index/introducing-chatgpt-atlas/
[help-atlas]: https://web.archive.org/web/20260625055336/https://help.openai.com/en/articles/12628199-using-ask-chatgpt-sidebar-and-chatgpt-agent-on-atlas
[relnotes]: https://web.archive.org/web/20261030084504/https://help.openai.com/en/articles/6825453-chatgpt-release-notes
