---
title: Computer-use environments and their fit for a Mac without Docker
created: 2026-11-01T09:18:00Z
modified: 2026-11-01T09:40:01Z
level: L1
version: 1.1.0
description: The sample app and hosted environments OpenAI points to, assessed for reuse on an Apple-silicon Mac with Node and headless Chrome and no Docker
status: unverified
grounded_in:
  - source: github.com/openai/openai-cua-sample-app README (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers (fetched 2026-11-01)
  - source: docs.stagehand.dev/v4/integrations/agent-frameworks/openai-cua-toolset-quickstart (fetched 2026-11-01)
  - source: docs.browser-use.com/open-source/customize/integrations/openai (fetched 2026-11-01)
  - source: docs.e2b.dev/agents/openai-computer-use (fetched 2026-11-01)
  - source: platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool (fetched 2026-11-01)
  - source: raw.githubusercontent.com/openai/openai-cua-sample-app/main/.node-version (fetched 2026-11-01)
  - source: raw.githubusercontent.com/openai/openai-cua-sample-app/main/javascript-app/package.json (fetched 2026-11-01)
  - source: raw.githubusercontent.com/openai/openai-cua-sample-app/main/javascript-app/README.md (fetched 2026-11-01)
  - source: raw.githubusercontent.com/openai/openai-cua-sample-app/main/javascript-app/examples/package.json (fetched 2026-11-01)
  - source: _context_/model-capabilities/claude-computer-tool.md (gateway probes 2026-11-01)
---

# Environments and Mac fit

Target: Apple-silicon Mac, Node, headless Chrome, no Docker.

| Option | What it is | Fit | Source |
|---|---|---|---|
| openai-cua-sample-app | MIT; JavaScript agent with Playwright code execution; Python agent with PyAutoGUI; shared console, labs, replay JSON, screenshot timeline | High for JavaScript: Node 22.20.0, pnpm 10.26.0, Playwright `chromium`, headless by default [sample-js]; the SDK example installs `chromium-headless-shell` and pins `openai` 7.33.0, `playwright` 1.58.0 [sample-ex]; Python agent drives the real desktop | [sample] |
| SDK `ComputerToolset` with Playwright driver | Pickup example on a local Chromium | High: Node 22.6+, `openai@7.33.0`, `playwright@1.61.1` | [tcu] |
| SDK `BrowserToolset` | Structured page reads and refs | High: same stack. **Inference:** fewer screenshots, as reads return text and refs | [drv] |
| Stagehand driver | Browser toolset (`createBrowserToolset`), not `ComputerToolset`; `StagehandBrowserDriver.launch` for headless local Google Chrome, `.browserbase` for a hosted session; `allowedDomains`, `blockedDomains` | High: Node 22.18+, Google Chrome installed; domain lists do not cover WebRTC | [stagehand] |
| Anthropic toolset, own environment | Client toolset: your application runs every call; not available in Managed Agents [ant] | High: accepted on five gateway models [gateway]. **Inference:** the Playwright driver can serve it through an adapter | [ant], [gateway] |
| Browser Use | Driver for all 28 browser tools; cloud or local Chromium | Medium: Python only | [bu] |
| E2B Desktop | Cloud Ubuntu XFCE desktop; noVNC live view, view-only option; egress controls | Medium: no local Docker, but cloud cost and data leave the Mac | [e2b] |
| Daytona | `ComputerToolset` with a Daytona desktop sandbox, Python | Medium: hosted; guide content not rendered in fetch | [tcu] |
| OpenAI Docker desktop recipes | Xvfb, XFCE, xdotool, Firefox containers | Low: require Docker | [int] |
| OpenAI isolated-desktop example | Linux guest in a VM on Apple silicon | Low to medium: needs a VM | [drv] |
| Anthropic reference implementation | Docker container | Low: requires Docker | [ant] |

## Reusable pieces

- Code-execution runtime contract and console design from the sample app [sample].
- Key-name, button, scroll and drag normalisers ([actions](api-action-handling.md)).
- SDK approval semantics: exact-true callbacks, target rebinding, `maxSteps`, `close()` draining [drv].
- E2B's live-view pattern: authenticated, view-only stream for watching [e2b].

**Inference:** start browser-only with Playwright headless Chromium at a 1440x900 viewport and device scale
factor 1, using `ComputerToolset` or `exec_js`; native macOS control (Screen Recording plus Accessibility, as
ChatGPT requires) is a later, separate stage with app-level approvals.

[sample]: https://github.com/openai/openai-cua-sample-app
[sample-js]: https://github.com/openai/openai-cua-sample-app/tree/main/javascript-app
[sample-ex]: https://github.com/openai/openai-cua-sample-app/blob/main/javascript-app/examples/package.json
[gateway]: ../model-capabilities/claude-computer-tool.md
[tcu]: https://developers.openai.com/api/docs/guides/tools-computer-use
[int]: https://developers.openai.com/api/docs/guides/tools-computer-use-integration
[drv]: https://developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers
[stagehand]: https://docs.stagehand.dev/v4/integrations/agent-frameworks/openai-cua-toolset-quickstart
[bu]: https://docs.browser-use.com/open-source/customize/integrations/openai
[e2b]: https://docs.e2b.dev/agents/openai-computer-use
[ant]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
