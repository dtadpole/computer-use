---
title: What it does, approvals and known limits
created: 2026-11-07T21:18:46Z
modified: 2026-11-09T02:50:00Z
version: 0.1.14
level: L1
status: unverified
description: What the agent can and cannot do on your Mac, what it asks you, and its known limits.
grounded_in:
  - source: _tools_/agent-core/cli.mjs (run, control-link, apps), loop.mjs (DEFAULT_BOUNDS), exclusions.mjs, policy.mjs
  - source: _designs_/desktop-extension/human-control.md, file-panels.md, app-policy.md
  - source: 'computer-use #136 (CU-289 saving a password or passkey), #153 (CU-252 an unreadable selection), #146 and #149 (CU-279, CU-296 IDE terminals and consoles)'
  - source: 'computer-use #59 and #168 (CU-241 Command/Control-Enter in a web editor, an iframe editor too), #175 (CU-297 hosted card and sign-in frames)'
  - source: 'computer-use #202 and #204 (D-089, CU-302, CU-322 - an approved browser''s page refused on the desktop route; unread browser targets too until the helper reports inWebArea)'
---

# What it does, approvals and known limits

## What it can and cannot do

It can click, long-press, Shift-click, Option-drag, type, press or hold keys (up to 10 s), scroll, drag within approved windows (across bare desktop: not yet shown live), use approved apps' menus, copy and paste, and choose a file in an open or save panel with your approval. It never reads or keeps your clipboard (a team verification paste may replace it).

It cannot see or act in an unapproved app (shown black); it asks first. It never acts in
terminals (IDE terminals and debug consoles too, any language) and launchers, password managers and Keychain, clipboard managers, System Settings, login and security
prompts, installers, Disk Utility, Time Machine, Activity Monitor, other AI apps or Writing Tools, a browser's pages (use browser mode), or its own live view, and never presses a system shortcut that acts beyond the app (Services, Dock hiding, input source, keyboard access). It never saves into or opens from `~/.ssh`, launch agents,
keychains, shell start-up files, login items or `/Applications`. A password field is handed to you, also after Show password reveals it (one never secure and labelled only by nearby text is not yet judged).

## Approvals

It asks before using a new app (once, this run, or always), running code (opening an app, script, installer or items it cannot read; App Store installs; Run in an IDE or notebook), sending (Command/Control-Enter in a web editor too), calling or joining a meeting, opening a link to another app (tel:, FaceTime), buying (free trials too), deleting or overwriting, granting a permission (saving a password or passkey too) or switching off account protection,
entering credentials or sensitive data in a field or embedded card frame (street address, e-mail, phone; not city or postcode) or in a web address (a card, key, e-mail, phone, street address, passport, tax id or bank account), pasting your own clipboard, copying a sensitive field's text, or labelled text (Passport, IBAN), into another field, and choosing a file (asked every time). Buying, deleting, permissions and
file choices are never pre-approved. Typed sensitive text stays out of run files. Unattended (`--consent unattended`), every question is declined. Manage "always" apps: `cli.mjs apps list`, `cli.mjs apps revoke <bundle id>`.

## Known limits

- Names are read in English and Chinese; approve only apps running in those languages.
- A file panel's question names the folder only if the agent opened it; otherwise check first.
- One display: your first app's, at its starting size; moving display ends the run.
- A leftover notification blocks clicks beneath it.
- Until the helper reads page boundaries, a browser's address bar, tabs, menus and shortcuts are refused too.
- A run stopped mid-hold names the key; pressing it releases it.
- A shortcut is judged as the menu item it fires; a window button's or view's own keys are not.
- An approved app's built-in AI counts as part of the app.
- A website's own shortcuts (a webmail's # deletes) are judged by the focus, not their effect.
