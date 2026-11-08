---
title: What it does, approvals and known limits
created: 2026-11-07T21:18:46Z
modified: 2026-11-08T02:43:27Z
version: 0.1.3
level: L1
status: unverified
description: What the agent can and cannot do on your Mac, what it asks you, and its known limits.
grounded_in:
  - source: _tools_/agent-core/cli.mjs (run, control-link, apps), loop.mjs (DEFAULT_BOUNDS), exclusions.mjs, policy.mjs
  - source: _designs_/desktop-extension/human-control.md, file-panels.md, app-policy.md
---

# What it does, approvals and known limits

## What it can and cannot do

It can click, long-press, Shift-click, Option-drag, type, press or hold keys (up to 10 s), scroll, drag within approved windows (across bare desktop: not yet shown live), use approved apps' menus, copy and paste, and choose a file in an open or save panel with your approval. It never reads or keeps your clipboard; a clipboard evaluation has CU Fixture hold and restore it, a verification paste row replaces it.

It cannot see or act in an unapproved app (shown black); it asks first. It never acts in
terminals and launchers, password managers and Keychain, clipboard managers, System Settings, login and security
prompts, installers, other AI apps, or its own live view. It never saves into or opens from `~/.ssh`, launch agents,
keychains, shell start-up files, login items or `/Applications`. A password field is handed to you, and it stays one after Show password puts it in plain text (one never secure and labelled only by nearby text is not yet judged).

## Approvals

It asks before using a new app (once, this run, or always), sending, buying, deleting or overwriting, granting a permission,
entering credentials or sensitive data (a shipping form's street address, e-mail, phone; not city or postcode), pasting your own clipboard, pasting into a field named for a bank account, tax id or secret (by keys, the Edit menu or a toolbar Paste), copying a sensitive field's text into another field (by keys, the Edit menu's Copy or a drag) or text shown beside a label such as Passport or IBAN, and choosing a file (asked every time). Buying, deleting, permissions and
file choices are never pre-approved. Typed sensitive text stays out of run files. Unattended (`--consent unattended`), every question is declined. Manage "always" apps: `cli.mjs apps list`, `cli.mjs apps revoke <bundle id>`.

## Known limits

- In a file panel the question names the folder only if the agent opened it (Go to Folder);
  otherwise "destination folder unknown" - check first.
- One display: your first app's, at its starting size; if an app moves display,
  the run ends.
- A leftover notification blocks clicks beneath it; dismiss it.
- A run can end partial or not done; its last line says so.
- A run stopped mid-hold names the key; the next run releases it, or press and release it.
- A drag of text out of a read-only text box beside a Passport or IBAN label is not yet judged on the
  desktop.
