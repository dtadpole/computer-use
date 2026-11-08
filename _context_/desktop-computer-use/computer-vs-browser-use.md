---
title: Computer use versus browser use
created: 2026-11-02T08:30:00Z
modified: 2026-11-05T16:26:33Z
level: L1
version: 1.0.1
description: How computer use (operating a whole desktop through screenshots and operating-system input) differs from browser use (acting inside the pages of one browser) in OpenAI, Anthropic and Google primary docs, and where our M1-M4 build sits.
status: unverified
grounded_in:
  - source: learn.chatgpt.com/docs/computer-use
  - source: learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security
  - source: learn.chatgpt.com/docs/browser
  - source: learn.chatgpt.com/docs/chrome-extension
  - source: web.archive.org/web/20260108213932/openai.com/index/introducing-operator/
  - source: platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
  - source: platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-tool
  - source: support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome
  - source: support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide
  - source: support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork
  - source: code.claude.com/docs/en/desktop
  - source: ai.google.dev/gemini-api/docs/computer-use
  - source: _context_/team-operations/decision-log.yaml
  - source: dtadpole/computer-use/_environments_/chrome-browser/INDEX.md
---

# Computer use versus browser use

| | Computer use | Browser use |
|---|---|---|
| Scope | Any app, window, menu, flows between apps [cu], [act] | Pages and tabs of one browser [abt], [cic] |
| Perception | Screenshots of screen or app [cu], [cow], [abt] | Accessibility tree, page text, DOM state, screenshots [abt], [cic], [br] |
| Action channel | OS input via Accessibility, background-capable on macOS [cu], [ccd], [cow] | In-page automation (extension debugger, CDP) [cic], [ext], [br] |
| Environment | User's desktop [cu], [cow]; reference Linux container [act] | Own profile, user's Chrome, remote browser [br], [ext], [op] |
| Permissions | macOS Screen Recording and Accessibility [cu], [ccd] | Browser extension permissions [cic], [ext] |
| Consent model | Per-app approval; terminals, ChatGPT, OS security prompts excluded [cu]; per-app tiers [ccd] | Per-site approval plus confirmations [ext], [cicp], [br] |
| Typical failure modes | Wrong window, scaling and Retina misclicks [cu], [act]; slow, side effects in other apps [cow] | Page prompt injection; layout shifts break coordinates [abt] |

## ChatGPT

Computer Use "can see and operate graphical user interfaces on macOS or Windows": Screen Recording to see,
Accessibility to "click, type, and navigate". It can be stopped or taken over, and "can't automate
terminal apps or ChatGPT itself" or approve OS security prompts [cu]. Its docs also call built-in-browser control
"Computer Use" [br], yet Browser Use site policies "do not apply" when it drives a browser as a native app [wls].
Operator also saw screenshots, but of "its own browser" [op]: pixel perception alone is not computer use.

## Anthropic

The computer use tool gives "screenshot capabilities and mouse/keyboard control for autonomous desktop interaction";
its reference environment is a Docker container [act]. For tasks inside webpages the browser use tool, reading
"the accessibility tree, elements, forms, and tabs", is "the closer fit" [act], [abt]. Claude in Chrome is the
browser-use product, acting through the `debugger` permission [cic]. The desktop product form is computer use in Cowork
and Claude Code: per-app prompts, browsers view-only, terminals click-only [ccd], [cow]. Google's single tool offers
browser, mobile and desktop environments [gem].

## Where our M1-M4 build sits

M1-M4 is browser use: one headless Chrome, screenshots and page-level input over CDP
([chrome-browser](../../_environments_/chrome-browser/INDEX.md), D-024). Carries over: agent core and adapters,
consent gate, trajectory, live control, MCP server, evaluation harness. Does not: CDP perception and
input, DOM inspector, site filter. Replacements, per D-024 and [ULTIMATE_GOAL](../../ULTIMATE_GOAL.md): app-scoped
capture, OS input from one granted helper, an app allowlist with hard exclusions, a local-input pause.

## Read next

- [ChatGPT desktop Computer Use plugin](../chatgpt-computer-use/product-desktop-computer-use.md)
- [Anthropic computer use tool](../chatgpt-computer-use/comparison-anthropic-tool.md)
- [Decision D-024](../team-operations/decision-log.yaml)
- [Sources, fetched 2026-11-02](computer-vs-browser-use-sources.yaml)

[cu]: https://learn.chatgpt.com/docs/computer-use
[wls]: https://learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security
[br]: https://learn.chatgpt.com/docs/browser
[ext]: https://learn.chatgpt.com/docs/chrome-extension
[op]: https://web.archive.org/web/20260108213932/https://openai.com/index/introducing-operator/
[act]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
[abt]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-tool
[cic]: https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome
[cicp]: https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide
[cow]: https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork
[ccd]: https://code.claude.com/docs/en/desktop
[gem]: https://ai.google.dev/gemini-api/docs/computer-use
