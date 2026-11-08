---
title: Agent-core changes for the desktop
created: 2026-11-02T08:29:12Z
modified: 2026-11-05T16:23:12Z
level: L1
version: 0.4.1
description: The changes agent core makes for desktop runs in M7 and M8 - modules, functions and the unit test each needs - and what stays as it is.
status: unverified
grounded_in:
  - source: _designs_/system-architecture/layout-and-ownership.md@0.8.4
---

# Agent-core changes for the desktop

Agent core stays environment-neutral: `runTask` takes any driver with the
[environment-driver](../system-architecture/environment-driver.md) interface. The desktop driver
(`_environments_/macos-desktop/`, cu-developer-two) reports `kind: 'desktop'`, `site: 'desktop:macos-local'`; maps
`hitTest` and `focused` to `inspectPoint` and `focusedElement`, `screenText` to `pageText` (`hiddenText` empty),
`state()` to `{ url: 'app:<bundleId>', title, frontmostBundleId, dialog, tabs: [] }` (approvals key by bundle id,
never that URL); and adds `pauseArmed` (true before the first `global` input), `localInput` events and `addApp`.

| # | Change (module) | Milestone | Unit tests |
|---|---|---|---|
| C1 | `exclusions.mjs`: the [exclusion table](app-policy.md), `isExcludedApp(bundleId)`, `isExcludedWindow({bundleId, url, title})`; config may only add, recorded in `run.json` | M7 | one per entry and prefix; the title marker and fixed-deny loopback ports; an added entry |
| C2 | `app-policy.mjs`: `createAppPolicy({ scope, approvals, exclusions })`, `classify(action, context)` in the order of [app policy](app-policy.md), reusing `policy.mjs`'s detectors | M7 | each step of the order |
| C3 | `app-approvals.mjs`: the `always` store in `$CU_HOME/app-approvals.json` (mode 600, atomic write), `list`, `revoke`, read at every action | M7 | grant once vs always; revoke mid-run; corrupt file fails closed (no approvals) |
| C4 | `control.mjs`: sender `local_input` may only `pause`; resume from `control`, `tty` or `api` | M8 | the permission table; a pause mid-batch skips the rest with the halt text |
| C5 | `loop.mjs`: `navigate` refused on desktop drivers; site or app policy by `environment.kind`; two consecutive blocks end `refused_by_policy` | M7 | per kind; the two-block rule |
| C6 | `run.mjs` and `cli.mjs`: `--env macos-desktop --app <bundle-id>...` attaches to running apps (the driver launches none), `apps list | revoke`; no desktop run starts with the local-input pause unarmed (`driver.pauseArmed`) | M7-M8 | arguments; refusal when not armed |
| C7 | trajectory: record `scope`, approvals, blocks by bundle id only, `localInput` kind only, and each action's mapping (`frameScaleX`, `frameScaleY`, `originPt`, `display`) from the driver's effect | M8 | the [privacy](trajectory-privacy.md) table, row by row |
| C9 | reverted by D-031: copy, cut and paste allowed (was refused under D-025) | M7 | the chords and menu items pass |
| C8 | `fake-env.mjs`: a desktop mode (`kind: 'desktop'`, frontmost app, AX targets, local-input events) | M7 | every change above runs against it |

## M8 follow-ups (red team, cu-verifier)

| # | Change (module) | Unit tests |
|---|---|---|
| P9 | `system_shortcut` blocks whole-system chords by name (`app-policy.mjs`) | each chord, any modifier order |
| P10 | `launch_code` confirm; it and `credential` never pre-approvable (`app-policy.mjs`) | each extension and gesture |
| P11 | start apps are candidates; `grantScope` only on a `live`, `tty` or `api` answer (`app-policy.mjs`, `loop.mjs`) | a start app asks; other answers grow nothing |
| C1+ | wider exclusions: agents, password and clipboard managers, installer prompts; children, trim, case (`exclusions.mjs`) | one per entry |
| scope | an approved or always-covered app joins the helper's scope by `addApp` before its first input; a refused add fails closed (`loop.mjs`) | `desktop-scope.test.mjs` |
| seat | desktop runs require a seat for the [desktop-run lock](desktop-run-lock.md) (`run.mjs`, `cli.mjs`) | refused without one |

## Unchanged

The action schema and validation, adapters and prompts, the consent gate and controllers, run tokens, bounds and
cancel, the inspector, secrets, the recorder, and the browser environment with its site filter.

## Order

C1, C2, C3, C5, C8, C9 first (M7); C4, C6, C7 and the follow-ups with M8. No synthetic input to any app but the fixture until C1, C2 and C4 are in and tested.
