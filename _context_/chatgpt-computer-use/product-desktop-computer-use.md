---
title: ChatGPT desktop Computer Use plugin
created: 2026-11-01T09:14:00Z
modified: 2026-11-01T09:42:51Z
level: L1
version: 1.1.0
description: How the 2026 desktop Computer Use plugin runs on macOS and Windows, perceives, acts, and which controls and exclusions apply
status: unverified
grounded_in:
  - source: learn.chatgpt.com/docs/computer-use (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/managed-configuration (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/appshots (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/sandboxing/auto-review (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/pets (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/whats-new/october-26-30-2026 (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/config-file/config-reference (fetched 2026-11-01)
---

# ChatGPT desktop Computer Use plugin

| Dimension | Documented behaviour | Source |
|---|---|---|
| Availability | Desktop app (Work or Codex), macOS and Windows, supported regions | [cu] |
| Packaging, invocation | Plugin with MCP server and skill toggles; `@Computer`, `@AppName` or a plain request | [cu] |
| Runs on | The user's machine, operating native apps | [cu], [wls] |
| macOS permissions | Screen Recording to see; Accessibility to click, type, navigate; entry named Codex Computer Use | [cu] |
| Perception and action | Views screen content, takes screenshots; interacts with windows, menus, keyboard input, clipboard state | [cu] |
| macOS mode | Scoped tasks run in the background while the user works | [cu], [wls] |
| Windows mode | Foreground only, active unlocked desktop; it moves the pointer; a Windows VM is suggested | [cu] |
| Model | GPT-6 Astra for hard visual tasks; GPT-6.1 Terra for "precise computer use" | [cu], [terra] |
| App approval | Per app; Always allow persists, revocable in Settings; admins can block saving (session approvals remain) | [cu], [mc] |
| Other actions | May ask before sensitive or disruptive actions; no categories listed | [cu] |
| Human control | Stop or take over any time; macOS picture-in-picture view; see [human control](product-human-control.md) | [cu], [pets] |
| Not affected | File reads, edits, shell follow sandbox and approval settings | [cu] |

## Hard exclusions

Computer Use cannot automate terminal apps or ChatGPT itself (that could bypass its security policies),
authenticate as administrator, or approve OS security and privacy prompts [cu], [wls]. Its app prompts
reach the user even under Auto-review [ar].

## Locked use (macOS, opt-in)

For tasks started from a connected device after the Mac locks; it installs an Apple authorization plug-in.
For a trusted, active turn ChatGPT temporarily unlocks, covers every display and blocks local use; local
keyboard or pointer input relocks the Mac and pauses automatic unlock until a manual unlock. Outside the
short-lived, scoped window, unlock is denied [cu]. Availability depends on remote-control eligibility [wls].
`computer_use.allow_locked_computer_use = false` removes the enable control but leaves existing Locked Use
on [mc].

## Policy files

- Windows saves decisions in `$CODEX_HOME/config.toml` under `[computer_use.windows]` as
  `always_allowed_app_ids`, using executable names or app user model IDs [cu].
- Admin `requirements.toml`: `[features].computer_use = false`; `[computer_use]` with
  `default_app_access = "deny"`, `allow_persistent_approval = false`, and
  `[computer_use.macos.bundle_ids]` entries such as `"com.apple.calculator" = "allow"` [mc].
- Windows admin rules: `computer_use.windows.aumids` or `computer_use.windows.exes` (requiring
  `publisher_name`, `product_name`, `access`) [mc].
- `allow_browser_and_computer_use = false` blocks both features (rejected under Local computer access
  with Work Cloud) [cfg].

## Perception gap

No fetched page documents accessibility-tree reading, screenshot cadence, resolution or coordinate scaling.
Accessibility is described only as letting ChatGPT "click, type, and navigate" [cu]; Appshots use it to read
window text [appshots]. Screenshots may be sent to OpenAI services [wls]. **Inference:** perception may mix
screenshots and accessibility text; unverified.

[cu]: https://learn.chatgpt.com/docs/computer-use
[wls]: https://learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security
[mc]: https://learn.chatgpt.com/docs/enterprise/managed-configuration
[appshots]: https://learn.chatgpt.com/docs/appshots
[ar]: https://learn.chatgpt.com/docs/sandboxing/auto-review
[pets]: https://learn.chatgpt.com/docs/pets
[terra]: https://learn.chatgpt.com/docs/whats-new/october-26-30-2026
[cfg]: https://learn.chatgpt.com/docs/config-file/config-reference
