---
title: Desktop computer use
created: 2026-11-02T08:45:27Z
modified: 2026-11-09T13:47:48Z
version: 1.4.1
description: 'What desktop computer use is, as distinct from browser use, and the macOS mechanics an app-scoped agent on this Mac depends on (D-024).'
grounded_in:
  - source: _seats_/cu-researcher/responsibilities.md (4.0.0, items 1 and 2)
  - source: ULTIMATE_GOAL.md (2.0)
---

# Desktop computer use

Instance of [`_context_`](../INDEX.md). The owner re-scoped the project to computer use on native macOS, app-scoped
(D-024). These articles separate that from the browser use we built in M1-M4 and collect the macOS mechanics the
M6 design needs, from Apple's documentation and probes that raise no privacy prompt.

| Article | Answers |
|---|---|
| [computer-vs-browser-use](computer-vs-browser-use.md) | scope, perception, action, permissions and consent of each; where M1-M4 sits |
| [macos-capture-and-input](macos-capture-and-input.md) | ScreenCaptureKit, CGEvent global and pid-targeted, Accessibility, points and pixels, displays |
| [macos-identity-and-background](macos-identity-and-background.md) | the helper's TCC identity, background operation, local-input pause, probe results, what needs an owner prompt |
| [tcc-request-questions](tcc-request-questions.md) | the questions behind the owner's single TCC request - Input Monitoring, Screen Recording re-confirmation, Accessibility, identity |
| [parity-from-runs](parity-from-runs.md) | where the first desktop runs differ from ChatGPT's documented computer use, and what follows |
| [parity-gaps-public-agents](parity-gaps-public-agents.md) | six capabilities where public computer-use agents go further than ours, each with a proposed test |
| [autofill-measurement](autofill-measurement.md) | CU-302: a saved login fills a sign-in form on load in a desktop run of an approved browser, and the helper sees the page as one opaque area |

## Read next

[computer-vs-browser-use](computer-vs-browser-use.md).
