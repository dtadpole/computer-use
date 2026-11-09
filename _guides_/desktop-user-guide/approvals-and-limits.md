---
title: What it does, approvals and known limits
created: 2026-11-07T21:18:46Z
modified: 2026-11-09T00:20:00Z
version: 0.1.12
level: L1
status: unverified
description: What the agent can and cannot do on your Mac, what it asks you, and its known limits.
grounded_in:
  - source: _tools_/agent-core/cli.mjs (run, control-link, apps), loop.mjs (DEFAULT_BOUNDS), exclusions.mjs, policy.mjs
  - source: _designs_/desktop-extension/human-control.md, file-panels.md, app-policy.md
  - source: 'computer-use #136 (CU-289 saving a password or passkey), #153 (CU-252 an unreadable selection), #146 and #149 (CU-279, CU-296 IDE terminals and consoles)'
---

# What it does, approvals and known limits

## What it can and cannot do

It can click, long-press, Shift-click, Option-drag, type, press or hold keys (up to 10 s), scroll, drag within approved windows (across bare desktop: not yet shown live), use approved apps' menus, copy and paste, and choose a file in an open or save panel with your approval. It never reads or keeps your clipboard (a team verification paste may replace it).

It cannot see or act in an unapproved app (shown black); it asks first. It never acts in
terminals (IDE terminals and debug consoles too, any language) and launchers, password managers and Keychain, clipboard managers, System Settings, login and security
prompts, installers, Disk Utility, Time Machine, Activity Monitor, other AI apps or Writing Tools, or its own live view, and never presses a system shortcut that acts beyond the app (Services, Dock hiding, input source, keyboard access). It never saves into or opens from `~/.ssh`, launch agents,
keychains, shell start-up files, login items or `/Applications`. A password field is handed to you, also after Show password reveals it (one never secure and labelled only by nearby text is not yet judged).

## Approvals

It asks before using a new app (once, this run, or always), running code (opening an app, script, installer or items it cannot read; Run in an IDE or notebook), sending, calling or joining a meeting, opening a link to another app (tel:, FaceTime), buying (free trials too), deleting or overwriting, granting a permission (saving a password or passkey too) or switching off account protection,
entering credentials or sensitive data in a field (street address, e-mail, phone; not city or postcode) or in a web address (a card, key, e-mail, phone, street address, passport, tax id or bank account), pasting your own clipboard, copying a sensitive field's text, or text shown beside a label such as Passport or IBAN, into another field, and choosing a file (asked every time). Buying, deleting, permissions and
file choices are never pre-approved. Typed sensitive text stays out of run files. Unattended (`--consent unattended`), every question is declined. Manage "always" apps: `cli.mjs apps list`, `cli.mjs apps revoke <bundle id>`.

## Known limits

- Names are read in English and Chinese (Simplified and Traditional); for other languages approve only apps running in one of those.
- A file panel's question names the folder only if the agent opened it; otherwise check first.
- One display: your first app's, at its starting size; moving display ends the run.
- A leftover notification blocks clicks beneath it.
- A run can end partial; its last line says so.
- A run stopped mid-hold names the key; the next run, or pressing it, releases it.
- A shortcut is judged as the menu item it fires; a window button's or view's own keys are not.
- App Store installs, prices and free trials ask.
- An approved app's built-in AI counts as part of the app.
- A website's own shortcuts (a webmail's # deletes) are judged by the focus, not their effect.
