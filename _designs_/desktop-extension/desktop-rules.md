---
title: Desktop block and confirm rules
created: 2026-11-02T09:53:32Z
modified: 2026-11-07T17:52:30Z
level: L1
version: 0.4.3
description: The rules behind the desktop order of checks - what is blocked by name (system shortcuts, excluded or unknown targets; copy and paste are allowed, D-031), the desktop confirm classes and their pre-approval, and what happens when an excluded app comes to the front.
status: unverified
grounded_in:
  - source: _tools_/agent-core/app-policy.mjs (PR 187, red-team fixes P9-P11)
  - source: _designs_/system-architecture/action-policy.md@0.8.4
---

# Desktop block and confirm rules

Detail for the order of checks in [app policy](app-policy.md); rule names are what `createAppPolicy` returns and the
trajectory records.

## Blocked by name

| Rule | Refused |
|---|---|
| `desktop:navigate` | `navigate`, browser-only |
| `system_shortcut` (P9) | a chord that acts on the whole system, below |
| `excluded:<kind>` | a target in an excluded app; `excluded:unknown` for a target, or a frontmost app, without a bundle id (fail closed) |

`system_shortcut` matches when a chord holds every key of an entry, so modifier order and extra modifiers do not
matter:

| Name | Chord |
|---|---|
| log out | `META+SHIFT+Q` |
| lock screen | `CTRL+META+Q` |
| screenshots (whole screen, selection, panel) | `META+SHIFT+3`, `4`, `5`, `6` |
| Spotlight | `META+SPACE` |
| Force Quit | `META+ALT+ESCAPE` |
| app switcher | `META+TAB` |
| Mission Control, Spaces | `CTRL` with an arrow |
| Show Desktop | `F11` |
| VoiceOver | `META+F5` |
| keyboard focus to the menu bar, Dock, status menus | `CTRL+F2`, `CTRL+F3`, `CTRL+F8` |

## Confirm classes on the desktop

| Class | When | Pre-approvable |
|---|---|---|
| browser classes | `submit`, `purchase`, `delete`, `permission`, `sensitive_data`, `page_dialog` (an AX sheet accepted with Return), from the AX name, role and typed text | as in the browser |
| `credential` | a typed credential | never on the desktop |
| `launch_code` (P10) | opening code, a package or an installer bundle: a double or triple click, `META+O` or `META+DOWN` on a target whose name, AX file name or AX URL ends `.app`, `.command`, `.sh`, `.pkg`, `.dmg`, `.scptd`, `.prefPane`, `.mobileconfig`, `.webloc` and similar - the file name or URL catches extensions Finder hides | never; only a hand-off outranks it |
| `unknown_target` (R92) | a click, an Enter or Space chord, or typed text with a newline on an `opaque` target ([input and targets](input-and-targets.md)) | per app |

Known gaps of `launch_code` are [Q-D10](open-questions.md).

## Secure and password fields (R83, CU-184)

A key action - typing, a keypress, a paste - into a secure field (`AXSecureTextField`, or the helper's `secure` or
`isPassword`) or under secure input is handed to the person, never pre-approvable (R83). So is one into a text entry
named with a password word (password, passcode, passphrase, PIN; whole words, normalised as CU-178): a "Show password"
toggle makes the secure field an `AXTextField` without changing what it holds. An entry whose name also says "hint"
stays a `credential` confirm. A click into either only focuses it (CU-170). The browser is unchanged: a password field
asks `credential`. Not covered: an unnamed shown field labelled by separate static text - neither handed off nor asked
until labels are read (CU-187).

## Foreground changes

If an excluded app comes to the front mid-run, the next action is handed to the person (the run is `taken_over`
until they hand back) and the frame shows black where it is; if it is still in front after the hand-back, the run
ends `refused_by_policy`.

`terminal_view` (block, E5): typing or keypresses into a target whose accessible name, description or role description
names a terminal, console or shell - an IDE's terminal panel runs commands like a terminal app; clicks stay allowed.

Copy, cut and paste are not blocked (D-031, replacing D-025): the chords and menu items reach approved apps like any
other input; P9 still refuses the system-wide chords, including the screenshot-to-clipboard ones.
