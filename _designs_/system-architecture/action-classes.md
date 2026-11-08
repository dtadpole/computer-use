---
title: Action classes
created: 2026-11-08T00:30:01Z
modified: 2026-11-08T02:13:53Z
level: L1
version: 0.3.0
description: The consequential-action classes the action policy confirms - each class and what triggers it, moved verbatim out of action-policy.md.
status: unverified
grounded_in:
  - source: _designs_/system-architecture/action-policy.md@0.8.10 (the class table, moved verbatim; CU-206)
---

# Action classes

The classes [action-policy](action-policy.md) confirms; a class applies when its trigger matches the target or text.

| Class | Detected when (target or text) |
|---|---|
| `submit` | click, or a Return (`ENTER` or a typed newline), on a control or field named like send, post, submit, publish, reply, sign up; a bare Reply is free only when every entry there was read empty |
| `purchase` | named like buy, pay, order, checkout, subscribe, donate; a Return in a form whose submit is named so |
| `delete` | named like delete, remove, discard, erase, empty bin, clear history, reset settings, uninstall, replace, overwrite, don't save, or trash on a button; Backspace on a focused list; Command-Delete; Command-D while a sheet is up |
| `permission` | sharing, invite, revoke, permission, API key or account-security controls |
| `credential` | `type`, paste or drag text into a password, `one-time-code` or `cc-*` field or a text entry named password, passcode, passphrase or PIN (a drag: live 20261108T004654Z-448b9d), or one the run saw as a password field, shown in plain text ([password-memory](password-memory.md); live 20261108T021023Z-e7ec71, 234243Z-121a27), or a `{{secret:name}}` placeholder |
| `sensitive_data` | `type`, pasted or browser-dragged text matching card, IBAN, routing-and-account, national or tax id, phone, e-mail, key, 0x-key or recovery-phrase patterns, a URL carrying it (R29), typing, pasting (any Paste route) or dragging text into a text entry named for a bank account, tax id, secret or identity detail (e.g. recovery phrase, one-time code, passport number; `policy.mjs` name lists), text pasted or dragged from such a field, or copied or dragged from shown text captioned so ([copy-source](copy-source.md), [copy-caption](copy-caption.md), [drag-text](drag-text.md); live 20261108T004646Z-a15df9, 012741Z-5a5f14), or a desktop paste not copied by the run ([paste-consent](paste-consent.md)) |
| `new_site` | `navigate` to an origin the site filter answers `not_allowed`; approval adds it for the run |
| `page_dialog` | `ENTER` or `type` while a `confirm`, `prompt` or `beforeunload` dialog is held, a page's permission request or download; the request carries its text and a screenshot; a model keypress alone accepts nothing |
| `install` | file-run prompts (refused by the driver) |
