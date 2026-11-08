---
title: Desktop block and confirm rules
created: 2026-11-02T09:53:32Z
modified: 2026-11-08T16:15:40Z
level: L1
version: 0.4.8
description: The rules behind the desktop order of checks - what is blocked by name (system shortcuts, excluded or unknown targets; copy and paste are allowed, D-031), the desktop confirm classes and their pre-approval, and what happens when an excluded app comes to the front.
status: unverified
grounded_in:
  - source: _tools_/agent-core/app-policy.mjs (PR 187, red-team fixes P9-P11)
  - source: _designs_/system-architecture/action-policy.md@0.8.4
---

# Desktop block and confirm rules

Detail for [app policy](app-policy.md)'s order of checks; rule names are what `createAppPolicy` returns.

## Blocked by name

| Rule | Refused |
|---|---|
| `desktop:navigate` | `navigate`, browser-only |
| `system_shortcut` (P9) | a chord that acts on the whole system, below |
| `system_service` (CU-249) | a click on a Services item or a chord bound to one (by the helper's flag or a default title) |
| `excluded:<kind>` | a target in an excluded app; `excluded:unknown` for a target, or a frontmost app, without a bundle id (fail closed) |

`system_shortcut` matches a chord holding every key of an entry, in any order, extra modifiers too:

| Name | Chord |
|---|---|
| log out | `META+SHIFT+Q` |
| lock screen | `CTRL+META+Q` |
| screenshots | `META+SHIFT+3`, `4`, `5`, `6` |
| Spotlight | `META+SPACE` |
| Force Quit | `META+ALT+ESCAPE` |
| app switcher | `META+TAB` |
| Mission Control, Spaces | `CTRL` with an arrow |
| Show Desktop | `F11` |
| VoiceOver | `META+F5` |
| a default Service (CU-249) | exactly `META+SHIFT+` L, Y, B, 8, M or A |
| focus to the menu bar, Dock, status menus | `CTRL+F2`, `CTRL+F3`, `CTRL+F8` |
| input source, Character Viewer, Look Up (CU-242) | `CTRL+SPACE`, `CTRL+META+SPACE`, `CTRL+META+D` |
| Dock hiding, keyboard access, Tab focus, Zoom, Invert | `META+ALT+D`, `CTRL+F1`, `CTRL+F7`, `ALT+META+` 8 = -, `CTRL` too |

## Confirm classes on the desktop

| Class | When | Pre-approvable |
|---|---|---|
| browser classes | `submit`, `purchase`, `delete`, `permission`, `sensitive_data`, `page_dialog` (an AX sheet accepted with Return), from the AX name, role and typed text | as in the browser |
| `credential` | a typed credential | never on the desktop |
| `launch_code` (P10) | a double or triple click, `META+O` or `META+DOWN` on a name or AX URL ending `.app`, `.sh`, `.pkg`, `.dmg`; Finder's Open of a runnable or unread selection (CU-252); a drop on an app (CU-269) | never; only a hand-off outranks it |
| `install` (CU-254) | App Store install verbs; a price is `purchase` | never |
| `unknown_target` (R92) | a click, an Enter or Space chord, or typed text with a newline on an `opaque` target ([input and targets](input-and-targets.md)) | per app |

`launch_code` gaps: [Q-D10](open-questions.md).

## Secure and password fields (R83, CU-184)

A key action - typing, a keypress, a paste - into a secure field (`AXSecureTextField`, or the helper's `secure` or
`isPassword`) or under secure input is handed to the person, never pre-approvable (R83). So is one into a text entry
named with a password word (password, passcode, passphrase, PIN): a "Show password"
toggle makes the secure field an `AXTextField` without changing what it holds. An entry whose name also says "hint"
stays a `credential` confirm. A click into either only focuses it (CU-170). The browser is unchanged: a password field
asks `credential`. Not covered: an unnamed shown field labelled by separate static text - neither handed off nor asked
until labels are read (CU-187).

## Foreground changes

If an excluded app comes to the front, the next action is handed to the person (`taken_over`) and the frame shows
black there; still in front after the hand-back, the run ends `refused_by_policy`.

`terminal_view` (block, E5): keys into a target whose name, description or role description names a terminal,
console or shell (an IDE's terminal panel); clicks stay allowed.

Copy, cut and paste are not blocked (D-031): they reach approved apps like any input; P9 still refuses the
screenshot-to-clipboard chords.
