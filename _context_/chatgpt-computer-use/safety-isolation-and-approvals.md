---
title: Isolation and scoped approvals for computer use
created: 2026-11-01T09:16:00Z
modified: 2026-11-01T09:48:00Z
level: L1
version: 1.1.0
description: The environment isolation recipes and the app, site and origin approval scopes OpenAI documents, plus admin policy layers
status: unverified
grounded_in:
  - source: developers.openai.com/api/docs/guides/tools-computer-use-integration (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-01)
  - source: developers.openai.com/api/docs/guides/agents-api/tools/computer-use (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/computer-use (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/browser (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/chrome-extension (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/managed-configuration (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/sandboxing/auto-review (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/sandboxing (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/permission-modes (fetched 2026-11-01)
---

# Isolation and scoped approvals

## Isolation recipes

| Environment | Documented safeguards | Source |
|---|---|---|
| Local Playwright | `chromiumSandbox: true`, `env: {}` (no host variables), `--disable-extensions`, `--disable-file-system` | [int] |
| SDK samples | Route-abort page requests or allow only task origins by parsed protocol, host and port; fresh profile; no credentials in page text or screenshots | [tcu], [drv] |
| Docker desktop | Non-root user; `--network none --cap-drop ALL --security-opt no-new-privileges --pids-limit 256 --memory 2g --cpus 2`; no host files, credentials or Docker socket; internet tasks need a VM or egress allow-list | [int] |
| Watchable desktop | Password-less noVNC viewer bound to 127.0.0.1, desktop on an internal network; deployments need per-session auth and egress limits | [int] |
| Hosted partners | Session timeout, guaranteed release, provider network rules | [tcu] |
| ChatGPT | Work Cloud in VM-backed sandboxes; built-in browser on a separate profile; Windows app optionally in a VM | [wcs], [br], [cu] |

## Approval scopes

| Scope | Options | Source |
|---|---|---|
| Native app (Computer Use) | Ask per app; Always allow; revoke in Settings | [cu] |
| Website (extension) | Allow once, for this site, for all sites, Decline; shared host allowlist and blocklist | [ext] |
| Website (cloud) | Always ask; Auto approve after relevance check; Always allow | [br] |
| Origin (Agents API) | approve, deny, cancel per new origin | [agt] |
| Browser history | Per request, no always-allow | [ext] |
| Full CDP | User enables it; explicit approval before inspecting a site with it | [br] |

Computer Use app prompts always reach the user. Auto-review covers only interactive escalation requests
(sandbox, blocked network, edits outside writable roots, MCP or app calls needing approval) and interrupts a
turn after 3 consecutive denials or 10 within the last 50 reviews [ar].

## Sandbox and permission modes

File and shell actions follow sandbox modes `read-only`, `workspace-write`, `danger-full-access` and approval
policies `on-request` or `never` [sb], [cu]; Computer Use instead reaches files through the approved app's own
permissions [wls]. Approve for me keeps the Ask for approval boundary and changes only the reviewer [pm].

## Admin policy layers

Requirements cannot be relaxed locally [mc]. Native apps: `default_app_access`, `allow_persistent_approval`,
bundle-ID, AUMID or executable rules; banning saved approvals still allows session approvals [mc]. Browser:
per-origin `access`, `uploads`, `downloads`, `full_cdp_access`, `access_approval_lifetime` (UI: This turn, This
thread); the most restrictive match wins [mc]. Browser Use rules do not cover Computer Use driving a browser as a
native app; deny that app or set `computer_use = false` [mc]. `[features]` switches: `computer_use`,
`browser_use`, `browser_use_external`, `in_app_browser`, `browser_use_full_cdp_access`; separately top-level
`allow_appshots` and `[computer_use] allow_locked_computer_use` [mc]. Requirements precedence, lowest to highest:
system `requirements.toml`, Agent Security, legacy `managed_config.toml`, macOS MDM [mc]. Admins test an
allowed and a blocked site, and app on each OS [mc].

**Inference:** consent records need a target (app, origin) and a lifetime (once, turn, thread, always).

[int]: https://developers.openai.com/api/docs/guides/tools-computer-use-integration
[drv]: https://developers.openai.com/api/docs/guides/tools-computer-use-sdk-drivers
[tcu]: https://developers.openai.com/api/docs/guides/tools-computer-use
[agt]: https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use
[cu]: https://learn.chatgpt.com/docs/computer-use
[br]: https://learn.chatgpt.com/docs/browser
[ext]: https://learn.chatgpt.com/docs/chrome-extension
[wls]: https://learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security
[wcs]: https://learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security
[mc]: https://learn.chatgpt.com/docs/enterprise/managed-configuration
[ar]: https://learn.chatgpt.com/docs/sandboxing/auto-review
[sb]: https://learn.chatgpt.com/docs/sandboxing
[pm]: https://learn.chatgpt.com/docs/permission-modes
