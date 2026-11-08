---
title: A click into a text entry takes no class from the entry's own name
created: 2026-11-07T14:35:50Z
modified: 2026-11-07T14:42:45Z
level: L1
version: 0.2.0
description: How a pointer press on a plain text entry is judged - it only places the cursor, so the entry's name gives it no purchase, delete or permission class - while comboboxes, selects, buttons and every Return keep today's judgement.
status: unverified
grounded_in:
  - source: cu-verifier's CU-167 live rows (a click into 'Social Security number' asked permission - 'security' - so the row needed Tab focus), 2026-11-07
  - source: CU-170 (cu-verifier's proposal and acceptance)
  - source: cu-verifier's and cu-developer-two's reviews of PR 409 (inherited isContentEditable; editable as 'takes text' in PR 411), 2026-11-07
---

# A click into a text entry takes no class from the entry's own name

## Finding

`classify` judges the target's name on every pointer press (`policy.mjs`, the `pressesTarget` branch). A click
into a field named *Social Security number*, *Security code* or *Security question* asks `permission`, because
*security* is a permission word. The click only places the cursor; nothing is granted.

## Rule

A pointer press (`click`, `double_click`, `triple_click`) on a **plain text entry** takes no `purchase`, `delete`
or `permission` class from that entry's own name. A plain text entry takes text and is itself the entry:
- **browser**: `editable === true` and the element is an `<input>` or `<textarea>`, or has the role `textbox` or
  `searchbox`. Editable alone is not enough: `isContentEditable` is inherited, so a `<button>` inside a rich editor
  reports editable, and it keeps its name judgement (cu-verifier).
- **desktop**: the role `AXTextField`, `AXSecureTextField`, `AXTextArea` or `AXSearchField`, and `editable` not
  false. The helper's editable is AXValue settable, so a read-only field keeps its name judgement.

## Unchanged

- **Comboboxes and selects** (`combobox`, `AXComboBox`, `AXPopUpButton`, a `<select>`): choosing from *Permission
  level* or *Role* can grant access, and the option clicked next (*Admin*) carries no permission word. They keep
  their name judgement.
- **Buttons, links, menu items and every other control**: unchanged.
- **A Return** in a text entry commits its form, so the entry's name and the default button's name are judged as
  today.
- **What is typed** into the entry is judged as today: CU-163, CU-164 and CU-167's name rules for typing are untouched.
- **`submit` from the entry's name** stays: the matrix pins a click on a field named like *Send a message* as
  `submit` (`click-submit-field-name`). Narrowing it is a separate decision.

## Read-only and disabled entries

A read-only input styled as a button, named *Delete*, must still ask. #411 (CU-173, cu-developer-two) makes the
browser's `editable` mean *takes text*: read-only and disabled inputs report false, as the desktop already did. The
rule needs no new field, and lands after #411.

## Tests

- A click into a text entry named *Social Security number* or *Security code*: allowed. The same name on a button
  still asks `permission`.
- A click on a combobox named *Permission level*: still asks.
- A `<button>` named *Delete* inside a contenteditable (editable inherited): still asks `delete`.
- A read-only input named *Delete* (editable false): still asks.
- A Return in a field named *Security code*: unchanged.
- Mutants: the narrowing applied to comboboxes; the role or tag condition dropped; the editable condition dropped.
- Matrix cells for each, and a live row on the secret-fields pages: the click asks on main and is allowed after.
