---
title: ChatGPT browser surfaces for agent use
created: 2026-11-01T09:15:00Z
modified: 2026-11-01T09:42:51Z
level: L1
version: 1.1.0
description: The desktop built-in Browser, the ChatGPT Work cloud browser and the browser extension compared by session, perception, action and controls
status: unverified
grounded_in:
  - source: learn.chatgpt.com/docs/browser (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/chrome-extension (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/managed-configuration (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/enterprise/chatgpt-work-overview (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/reference/settings (fetched 2026-11-01)
  - source: learn.chatgpt.com/docs/config-file/config-reference (fetched 2026-11-01)
---

# ChatGPT browser surfaces

| | Desktop built-in Browser | Work cloud browser | Browser extension |
|---|---|---|---|
| Runs | In the desktop app | Cloud computer; continues with the user's device closed | Chrome, Edge, Brave, Opera, Vivaldi |
| Session | Own profile; user signs in directly | Own cookies and sessions, kept across tasks; no personal browser data | User's tabs and signed-in accounts |
| Agent does | Open, click, type, inspect rendered state, screenshot, verify | Read, click, type | Read or act on signed-in sites |
| User sees | Shared view in the chat | Page screenshots and browser replay [wov] | Not specified |
| Site approval | Browse, Download, Upload each Requires approval, Always allow or Block; per-site exceptions [set] | Always ask; Auto approve after relevance check; Always allow (not recommended) | Allow once, Allow for this site, Allow for all sites, Decline; per host |
| Confirms before | Submitting information, purchases, permission changes, deleting data | Consequential actions such as booking or payment; financial, legal or account commitments [wov] | No categories listed |
| Sign-in, blocks | Within the profile; CAPTCHA handling not documented | Pauses for a secure form (2FA codes) or on-page sign-in ending with I'm done; not in Enterprise or Edu; CAPTCHA sites may fail; take over if blocked | Existing sign-ins |
| Files | System Downloads folder by default; no automated uploads despite an Upload permission | Not documented | Chrome uploads need Allow access to file URLs |
| Sources | [br] | [br], [wcs] | [ext] |

## Distinctive mechanisms

- **Developer mode:** controlled full Chrome DevTools Protocol access in the built-in browser and Chrome;
  explicit approval before use; admins can set `browser_use_full_cdp_access = false` [br].
- **Secure sign-in (cloud):** credentials go to the browser, not the model; a review model first checks for
  phishing; the user sees the address and form preview [br].
- **Auto-review:** browser actions can go to automatic review; disabling it "sends those actions to the user
  for approval instead" [mc].
- **Annotations:** in Annotation mode the user clicks an element or drags an area, writes a comment, then asks
  ChatGPT to address it [br].
- **History:** asked per request; no always-allow [ext].
- **Use password manager** is a separate permission for in-app and cloud browsers [wcs].
- **Extension permissions** include page debugger access and native-app messaging [ext]. **Inference:**
  control runs over the debugger API and native messaging.
- **Storage:** extension actions are kept only as chat context, including screenshots [ext].

## Policy boundaries

Browser Use site and capability rules govern the built-in browser and extension, not Computer Use driving a
browser as a native app [wls], [mc]. Blocking every path needs `computer_use = false`, an app rule [mc], or
`allow_browser_and_computer_use = false` (rejected under Local computer access with Work Cloud) [cfg]. Site
rules take origins only; the most restrictive match wins; non-persistent approvals last This turn or This
thread (default `thread`) [mc], [cfg]. Desktop rules do not configure the cloud browser [mc].

[br]: https://learn.chatgpt.com/docs/browser
[ext]: https://learn.chatgpt.com/docs/chrome-extension
[wls]: https://learn.chatgpt.com/docs/enterprise/chatgpt-work-local-security
[wcs]: https://learn.chatgpt.com/docs/enterprise/chatgpt-work-cloud-security
[mc]: https://learn.chatgpt.com/docs/enterprise/managed-configuration
[wov]: https://learn.chatgpt.com/docs/enterprise/chatgpt-work-overview
[set]: https://learn.chatgpt.com/docs/reference/settings
[cfg]: https://learn.chatgpt.com/docs/config-file/config-reference
