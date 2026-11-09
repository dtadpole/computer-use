---
title: Approved Chrome's web tree through the helper (CU-321, 2026-11-09)
created: 2026-11-09T08:30:00Z
modified: 2026-11-09T08:30:00Z
level: L1
version: 0.1.0
description: 'The read-only CU-321 measurement - a default Chrome for Testing page stays one opaque area to CUHelper 0.2.61 even with AXManualAccessibility set, while --force-renderer-accessibility exposes page controls by role and name - and what it means for D-089.'
status: unverified
grounded_in:
  - source: Linear CU-321 (plan 0.1, OK cu-developer-one; D-084's conditions extended by cu-coordinator)
  - source: decisions D-089 and D-096; Linear CU-322 (cu-verifier's rows C1-C8 on 0.2.61)
---

# Approved Chrome's web tree through the helper (CU-321)

**Setup.** One idle-checked enforced hold, 9 Nov 08:21:42-08:22:34Z. No input was sent: only `cli.mjs inspect`
hit-tests through CUHelper 0.2.61. The browser was Chrome for Testing 157 under D-084's conditions: a portable copy, a
throwaway profile, a private `CU_HOME`, everything deleted afterwards. The probe page was served on loopback and held:

- a button `Continue`;
- a text field with the placeholder `Email`;
- a link `Terms of service`;
- a `div role=menuitem` named `Sign in`;
- a `div role=toolbar`;
- a same-origin iframe holding a button `Pay now`.

## Rows

| Step | Launch | When read | What all six points read |
|---|---|---|---|
| S2/S3 | default (the helper sets AXManualAccessibility at each hit-test) | t0, +2, +5, +15 s | `AXScrollArea`, no name, opaque |
| S4 | `--force-renderer-accessibility` | t0 and the same later | `AXButton 'Continue'`, `AXTextField` (no name), `AXLink 'Terms of service'`, `AXMenuItem 'Sign in'`, `AXStaticText` (the toolbar's text), `AXButton 'Pay now'` (in the iframe) |

`inspect` prints neither the focused element nor `inWebArea`. cu-verifier's CU-322 rows read both on the same kind
of rig: a page control reads true, and the address bar and menus read false.

## What follows

- **Late build ruled out.** The page stays opaque for 15 s with AXManualAccessibility set. That attribute makes
  Electron build its tree, but a default Chrome does not build its page tree for this client.
- **The flag builds it at once.** With `--force-renderer-accessibility`, page controls read by role and name,
  including inside a same-origin iframe.
- **Not tested:** a VoiceOver-style AXEnhancedUserInterface write. It is an Accessibility write with known side
  effects, so a helper change and a design note come first.

## For D-089 (cu-developer-one decides)

1. Keep D-096's shape: refuse page content (`inWebArea` true or unread), and judge browser chrome where `inWebArea`
   is false. A default page is opaque, so the opaque rule stays.
2. Tell chrome from page by ancestry only, never by role: a page's ARIA div reads `AXMenuItem 'Sign in'`, just like
   a real menu item.
3. No further narrowing now. Judging page controls by name on the desktop route would need the page tree, either from
   a run-owned browser started with the flag or from the write above. Browser tasks already have DOM-level rules in
   the browser environment. If a desktop-route web task is ever needed, start with a design note for a run-owned
   Chrome for Testing with the flag, never the owner's Chrome.
