---
title: Action policy
created: 2026-11-01T09:24:10Z
modified: 2026-11-09T01:20:00Z
level: L1
version: 0.9.3
description: How every action is classified allow, confirm, block or hand-off from its target and context, the consequential-action classes including new sites and dialogs, and caller pre-approvals.
status: unverified
grounded_in:
  - source: _context_/chatgpt-computer-use/safety-confirmation-policy.md@1.0.0
  - source: _context_/chatgpt-computer-use/safety-isolation-and-approvals.md@1.0.0
  - source: CU-302 design note 0.1 (2026-11-09 01:12Z; a saved login autofilled on load)
---

# Action policy

`policy.classify` judges every action, in every batch (R27); the most restrictive rule wins.

## Decisions, in order

1. **block**: the [site filter](site-filter.md) refuses the foreground page or a `navigate` target, except for `not_allowed`.
2. **handoff**: any `chrome-error:` page or driver-reported warning (certificate or network; the latter an accepted over-ask), or a password-change form's final submit; the person acts (R28). Safe Browsing never warns here.
3. **confirm**: a class below applies and no pre-approval covers it.
4. **allow**: everything else.

## Consequential classes

Each class and what triggers it: [action-classes](action-classes.md).

A click into a plain text entry takes no class from its name except `submit` ([text-entry-focus-click](text-entry-focus-click.md)). A key activating a focused control, or a long press or drag on one, is judged like a click on it; a drop onto
a Trash, Bin, Delete or Remove zone asks ([keyboard-activation](keyboard-activation.md), [press-and-drop](press-and-drop.md)).
A Return also judges the window's default button by name, from a single-line or non-text focus; an unreadable one asks `submit`.
With a dialog open, `ENTER` also takes its message's classes. An `alert` (OK only) is
accepted. It errs toward `confirm`; each class
has allowed and blocked tests (R51).

## Pre-approvals

Only the caller grants them (`preApprovals`), never the model or page. They may cover
`submit`, `credential` (caller-supplied secrets), named `sensitive_data`, `new_site`, and `page_dialog` of the named kind.
None covers a submit of a form the browser autofilled from saved logins or cards: a click, Space or Return on what
submits it asks by the filled fields' names, from the driver's `autofilledFields` (CU-302; a failed read asks credential).
`purchase`, `delete` and `permission` always confirm.

## Task screening

`policy.screenTask(task)` first refuses bank transfers, trading and high-stakes medical or legal decisions (R56):
`refused_by_policy`.
