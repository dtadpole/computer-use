---
title: What it does, approvals and known limits
created: 2026-11-07T21:18:46Z
modified: 2026-11-10T06:30:00Z
version: 0.1.24
level: L1
status: unverified
description: What the agent can and cannot do on your Mac, what it asks you, and its known limits.
grounded_in:
  - source: _tools_/agent-core/cli.mjs (run, control-link, apps), loop.mjs (DEFAULT_BOUNDS), exclusions.mjs, policy.mjs
  - source: _designs_/desktop-extension/human-control.md, file-panels.md, app-policy.md
  - source: 'computer-use #136 (CU-289 saving a password or passkey), #153 (CU-252 an unreadable selection), #146 and #149 (CU-279, CU-296 IDE terminals and consoles)'
  - source: 'computer-use #59 and #168 (CU-241 Command/Control-Enter in a web editor, an iframe editor too), #175 (CU-297 hosted card and sign-in frames)'
  - source: 'computer-use #202 and #204 (D-089, CU-302, CU-322 - an approved browser''s page refused on the desktop route; unread browser targets too until the helper reports inWebArea)'
  - source: 'computer-use #195 and #200 (CU-302 - a submit of a form the browser autofilled asks by the filled fields, never pre-approved)'
  - source: 'computer-use #245 and #246 (CU-325 - a card in a web address path asks; CU-326 - an untyped card in a host label or split across segments does not, Medium under-ask)'
  - source: 'CU-322 live rows on helper 0.2.61 (cu-verifier 08:04Z, red-teamed by cu-researcher 08:07Z) - the address bar, menu bar and omnibox read inWebArea false and are judged as before; page targets stay refused'
  - source: 'computer-use #250 (CU-326 - a card in a host label, split across all-digit segments or zero-padded now asks; the limit line goes) and CU-336 (a short code into an unnamed payment frame now asks - PR #274; its over-ask named)'
  - source: 'computer-use #174 (CU-263 - a human check is handed to the person: provider frames, frame hosts titled for one, pressed names, text and audio entries)'
  - source: 'computer-use PR #294 (CU-340 - a value split across boxes asks at the completing box; digits typed after a desktop paste the run cannot read ask, a named over-ask)'
  - source: 'computer-use PR #323 and PR #331 (CU-352, CU-345 - action and field names in German, French, Spanish, Russian, Japanese and Korean; D-099 lists the rest by name)'
  - source: 'computer-use PR #356 and PR #367 (CU-363, CU-365 - a page or app key or chord that fires no menu item, outside a text field, asks)'
  - source: 'computer-use PR #397, PR #414 and PR #417 (CU-377 drop and file paste, CU-378/CU-379 phrases; named limits)'
  - source: 'computer-use PR #386 and PR #387 (CU-361 - a box labelled only by nearby text is judged by that label; the limit goes)'
  - source: 'computer-use PR #442, PR #463 (CU-398 - an Apple-menu item click is blocked), PR #454 (CU-395 - Home and Find My excluded; physical controls asked every time), PR #355 (CU-360 - a page''s mailto: link)'
---

# What it does, approvals and known limits

## What it can and cannot do

It can click, long-press, type, press or hold keys (up to 10 s), scroll, drag within approved windows (across bare desktop: not yet live), use approved apps' menus, copy and paste, and choose a file in an open or save panel, with approval. It never reads or keeps your clipboard (a verification paste may replace it).

It cannot see or act in an unapproved app (shown black); it asks first. It never acts in
terminals (IDE ones too) and launchers, password managers and Keychain, clipboard managers, System Settings, login and security
prompts, installers, Disk Utility, Time Machine, Activity Monitor, other AI apps or Writing Tools, the Home and Find My apps, a browser's pages (use browser mode), or its own live view, and never presses a system shortcut that acts beyond the app (Services, Dock hiding, input source, keyboard access) or clicks an Apple-menu item (Restart, Shut Down, Log Out). It never saves into or opens from `~/.ssh`, launch agents,
keychains, shell start-up files, login items or `/Applications`. Password fields (even revealed) and human checks (CAPTCHA) are handed to you.

## Approvals

It asks before using a new app (once, this run, or always), running code (opening an app, script, installer or items it cannot read; App Store installs; Run in an IDE or notebook), sending, calling or joining a meeting, opening a link to another app (tel:, FaceTime), buying (free trials too), deleting or overwriting, physical unlocking, opening or disarming (every time), granting a permission (saving a password or passkey too) or switching off account protection, submitting a form your browser autofilled,
entering credentials or sensitive data in a field or embedded card frame (street address, e-mail, phone; not city or postcode) or in a web address (also cards, keys, passports, tax ids and bank accounts), pasting your own clipboard, copying a sensitive field's text, or labelled text (Passport, IBAN), into another field, and choosing a file (asked every time). Buying, deleting, permissions and
file choices are never pre-approved. Typed sensitive text stays out of run files. Unattended (`--consent unattended`), every question is declined. Manage "always" apps: `cli.mjs apps list`, `apps revoke <bundle id>`.

## Known limits

- Names are read in English, Chinese, German, French, Spanish, Russian, Japanese and Korean only.
- A file panel's question names the folder only if the agent opened it.
- One display, at its starting size; moving it ends the run.
- A page script can open your mail app (mailto:); a clicked one asks, and the agent acts there only if approved.
- A shortcut is judged by the menu item it fires; other letters and non-editing chords outside a text field ask.
- Bare Accept, Connect, Join, Follow, Reject: free.
- A file the agent copied with nothing selected, pasted elsewhere, is not asked.
- An approved app's built-in AI counts as the app.
- A 3- or 4-digit number or expiry typed into another site's untitled frame is asked.
- Digits typed after an unreadable paste ask.
