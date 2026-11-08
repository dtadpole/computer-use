---
title: OpenAI computer-use product surfaces overview
created: 2026-11-01T09:12:00Z
modified: 2026-11-01T09:42:51Z
level: L1
version: 1.1.0
description: One-table map of every OpenAI computer-use surface by where it runs, how it perceives, how it acts and what the human controls
status: unverified
grounded_in:
  - source: learn.chatgpt.com/docs/computer-use (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/browser (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/chrome-extension (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/dots/computers-and-apps (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/dots/controls (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/extend/record-and-replay (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/appshots (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/webmcp (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/chatgpt-work-overview (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/agents-api/tools/computer-use (fetched 2026-11-01)
  - source: enterpriseaiworld.com ChatGPT agent article 170662 (secondary, fetched 2026-11-01)
  - source: deepnoodle.ai/atlas/timeline/2025-01-23-openai-operator (secondary, fetched 2026-11-01)
---

# OpenAI computer-use product surfaces overview

Conventions for every article in this folder: unlabelled claims are documented in the linked primary source;
links labelled `press-…` are secondary reports; **Inference:** marks analysis.

| Surface | Runs on | Perceives via | Acts via | Human controls | Detail |
|---|---|---|---|---|---|
| Operator, CUA (2025) | Cloud browser | Screenshots | Mouse, keyboard | Takeover, watch mode, confirmations [press-dn-op] | [history](product-history.md) |
| ChatGPT agent (2025) | Cloud virtual computer | Visual browser, text browser | GUI, terminal, APIs, connectors | Confirm, watch, takeover [press-eaiw] | [history](product-history.md) |
| Desktop Computer Use | User's Mac or PC | Screenshots, screen content | Pointer and keyboard (macOS Accessibility permission) | App approvals, stop, take over [cu] | [desktop](product-desktop-computer-use.md) |
| Built-in Browser | Desktop app, separate profile | Rendered page, screenshots, optional CDP; Site tools [webmcp] | In-app browser | Site permissions, confirmations [br] | [browsers](product-browsers.md) |
| Browser extension | User's own browser and sessions | Page text, screenshots | Extension | Per-site approvals [ext] | [browsers](product-browsers.md) |
| Work cloud browser | OpenAI cloud VM | Web pages | Cloud browser | Site approvals, take over, secure sign-in [br]; screenshots and replay [wov] | [browsers](product-browsers.md) |
| dots | Dot's cloud computer or one connected computer | Pages, apps | Cloud or local executor | Action review, custom rules [dots-ctl]; take over [dots] | [work and dots](product-work-and-dots.md) |
| Record & Replay (macOS), Appshots | User's desktop | Demonstration, frontmost window | Skill replay (Record & Replay only) | Explicit recording [rr], hotkey [as] | [capture](product-capture-features.md) |
| API `computer` tool, code execution, SDK | Developer environment | Screenshots or page reads | Structured actions or code | Developer-built [tcu] | [api](api-contract.md) |
| Agents API `computer_use` | OpenAI-hosted browser | Screenshots | Hosted | Origin and sign-in approvals [agt] | [hosted](api-agents-hosted.md) |

## What the table implies

- Two execution locations coexist: OpenAI-managed cloud machines (Work Cloud, dots, Agents API) and the
  user's own computer (Computer Use, built-in Browser, extension, a dot's connected computer) [wcs], [wls],
  [dots], [agt].
- The docs tell users to prefer a dedicated plugin or MCP server for data access and use Computer Use when
  the task needs visual operation [cu]. The Computer Use page documents screenshots but no accessibility-tree
  reading and no screenshot cadence [cu].
- **Inference:** screenshots are the common perception channel, not the only one: ChatGPT agent had a text
  browser [press-eaiw], the extension reads page text [ext], Appshots read accessible text [as], and Site
  tools expose page actions [webmcp].
- **Inference:** human control takes four recurring forms: scoped approval (app, site, origin),
  confirmation at the risky step, take over, and stop [cu], [br], [dots-ctl]. Watching, notification and
  return of control are compared in [human control](product-human-control.md).

**Inference:** a self-built system should treat the browser path and the native-desktop path as separate
products with separate permission models, as OpenAI does: Browser Use site rules do not govern Computer Use
driving a browser as a native app [wls].

[cu]: https://learn.chatgpt.com/docs/computer-use
[br]: https://learn.chatgpt.com/docs/browser
[ext]: https://learn.chatgpt.com/docs/chrome-extension
[dots]: https://learn.chatgpt.com/docs/dots/computers-and-apps
[dots-ctl]: https://learn.chatgpt.com/docs/dots/controls
[wls]: https://learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security
[wcs]: https://learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security
[rr]: https://learn.chatgpt.com/docs/extend/record-and-replay
[as]: https://learn.chatgpt.com/docs/appshots
[webmcp]: https://learn.chatgpt.com/docs/webmcp
[wov]: https://learn.chatgpt.com/docs/enterprise/chatgpt-work-overview
[tcu]: https://developers.openai.com/api/docs/guides/tools-computer-use
[agt]: https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use
[press-eaiw]: https://www.enterpriseaiworld.com/Articles/News/News/OpenAI-Unveils-ChatGPT-agent-Bringing-Agentic-Capabilities-to-the-Masses--170662.aspx
[press-dn-op]: https://deepnoodle.ai/atlas/timeline/2025-01-23-openai-operator
