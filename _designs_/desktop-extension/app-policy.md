---
title: App policy and exclusions
created: 2026-11-02T08:29:12Z
modified: 2026-11-07T17:30:40Z
level: L1
version: 0.4.10
description: Per-app approval (once, always, revocable) that replaces the site filter on desktop runs, start apps as candidates only, the hard exclusion table that no approval lifts, and the desktop order of checks.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0 (consent and safety row)
  - source: _context_/chatgpt-computer-use/product-desktop-computer-use.md
  - source: _designs_/system-architecture/action-policy.md@0.8.4
  - source: _tools_/agent-core/exclusions.mjs and app-policy.mjs (PR 187, red-team fixes P9-P11)
---

# App policy and exclusions

## Order of checks (consent and safety row)

For every action, after batch validation and before input, agent core's `createAppPolicy` answers like the browser
policy: **block**, **handoff**, **confirm**, **allow**; the most restrictive wins. Each rule is detailed in
[desktop rules](desktop-rules.md).

1. **block**: `navigate`; `system_shortcut` (P9); a target in an excluded app, or one without a
   bundle id (`excluded:unknown`).
2. **handoff**, never pre-approvable: an excluded app frontmost (by bundle id); an OS authentication
   prompt; a secure or password-named field, or secure input (R83, CU-184); a system privacy or permission prompt, even in an approved app's window
   (the helper's `systemPrompt` mark, or Allow Paste / Open System Settings; CU-76).
3. **confirm `new_app`**: an app outside the run scope that the `always` store does not cover.
4. **confirm** by class: the browser classes, `launch_code` (P10) and `unknown_target` (R92). `credential` and
   `launch_code` are never pre-approvable on the desktop; `unknown_target` is, per app.
5. **allow**.

## Approvals and scope (P11)

The caller's apps are candidates only. The run scope starts empty: every app, start
apps included, asks `new_app` at its first action unless the `always` store covers it, and the scope grows only on an
approval answered on the `live`, `tty` or `api` channel. The driver launches the helper with an empty
scope; before the first capture each candidate the always store does not cover is asked `new_app`, so nothing is
captured before approval (R63, R68; a run with no approved app ends `declined`). The environment's scope is
authoritative (D-037): every approved or always-covered app joins it through `addApp(bundleId)` before its first input, a refused add fails the action closed, nothing posted, and the trajectory notes each addition
(`scopeAdded`, `always` or `approved`).

`always` approvals live in `$CU_HOME/app-approvals.json` (mode 600, written only by the consent gate after a human
answer); `cli.mjs apps list | revoke <bundle-id>` shows and removes them, effective at any running run's next action. The model and the calling session never approve ([consent-authority](../system-architecture/consent-authority.md)).

## Hard exclusions, never in scope

This table is the source of truth; agent core's `exclusions.mjs` holds it with a test per entry, and the Swift
helper (`Policy.swift`), the fake helper and verify-kit follow it.

| Kind | Bundle ids (`*` = prefix) |
|---|---|
| terminals and code runners | `com.apple.Terminal`, `com.googlecode.iterm2`, `dev.warp.*`, `com.mitchellh.ghostty`, `net.kovidgoyal.kitty`, `org.alacritty`, `co.zeit.hyper`, `com.github.wez.wezterm`, `com.apple.ScriptEditor2`, `com.apple.Automator`, `com.apple.shortcuts`, launchers `com.runningwithcrayons.Alfred`, `com.raycast.macos` |
| agents | `com.reflection.cu-helper`, `com.openai.*`, `com.anthropic.*`, `com.google.Chrome.app.*`, `com.microsoft.edgemac.app.*` (installed web apps can host our UIs) |
| password managers | `com.1password.*`, `com.agilebits.*`, `com.bitwarden.desktop`, `org.keepassxc.keepassxc`, `com.apple.Passwords`, `com.apple.keychainaccess`, `com.dashlane.*`, `com.lastpass.*`, `com.nordsec.nordpass` |
| clipboard managers | `org.p0deje.Maccy`, `com.clipy-app.Clipy`, `com.tapbots.Pastebot2Mac`, `com.tapbots.Pastebot3Mac` |
| OS security | `com.apple.systempreferences` (whole app, D-025), `com.apple.SecurityAgent`, `com.apple.LocalAuthentication.UIAgent`, `com.apple.loginwindow`, `com.apple.UserNotificationCenter`, `com.apple.coreservices.uiagent`, `com.apple.installer` |

An exact id also excludes its children (`id.`), so `com.apple.Terminal.helper` is Terminal's. Ids are trimmed and
matched case-insensitively. Run config may only add entries, recorded in `run.json` - how a check adds a stand-in
excluded fixture.

Browsers are approvable, but a window showing our live view or DSH's GUI is excluded by window: the live view's fixed title marker (`[cu live view]`) in the window list and AX, or as a fallback a known browser's
document URL on a loopback port of [the fixed deny list](../system-architecture/site-filter.md).
