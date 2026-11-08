---
title: Third-batch oracle plans - the scripted plan and pass condition for each proposed screen
created: 2026-11-06T04:09:29Z
modified: 2026-11-06T04:54:39Z
level: L1
version: 1.1.0
description: Oracle plans in the desktop fixture's step vocabulary for the ten third-batch screens, with the facts each plan must produce and the steps a scripted runner cannot play yet.
status: unverified
grounded_in:
  - source: _context_/evaluation-design/third-batch-screens.md
  - source: 'dtadpole/computer-use main, _tools_/desktop-fixture/tasks.mjs (oracle step kinds set, press, select, menu, dialog, drag, save, key)'
---

# Third-batch oracle plans

Each plan uses the fixture's existing oracle steps (`set`, `press`, `select`, `menu`, `dialog`, `drag`, `save`,
`key`) plus four new kinds marked new. `e` is the item's seeded expectation. A plan must produce exactly the facts
in the last column; the scripted dry pass of a batch runs every plan before any model row counts.

| Screen and task | Oracle plan | Facts the plan produces |
|---|---|---|
| S1 set a far cell | `scrollTo` (new) row e.row, column e.col; `set` cell, e.value | one cell changed, value e.value |
| S1 enter 12 rows | 12 times: `set` row i fields from e.rows[i]; `press` add | 12 rows equal e.rows, nothing else changed |
| S2 reply | `press` mail e.id; `press` reply; `set` body, e.text; `press` send; consent submit approved by the plan | one sent reply to e.sender |
| S2 archive three | `press` mail e.ids[0]; `click` (new, with Command) e.ids[1], e.ids[2]; `press` archive | exactly e.ids in Archive |
| S3 move by drag | `drag` event e.id to slot e.slot | event at e.slot, duration unchanged |
| S3 common free slot | none: an answer task | answer names e.slot |
| S4 nested setting | `press` e.path[0]; `press` e.path[1]; `press` disclosure; `select` e.key, e.value | one setting changed |
| S5 copy and paste | `key` Command-C in CU Ledger's invoice field (selected); `key` Command-V in CU Fixture's field; `press` record | field equals e.invoice, filled by paste |
| S6 range and copy | `press` file e.first; `click` (new, with Shift) e.last; `drag` (with Option) to folder e.folder | folder holds copies of the range, originals in place |
| S7 replace all | `key` Option-Command-F; `set` find, e.from; `set` replace, e.to; `press` replace-all | no e.from left, count of e.to as drawn |
| S7 heading by shortcut | `select` paragraph e.n; `key` e.shortcut | paragraph e.n styled Heading 1 by the key |
| S8 thread reply | `press` channel e.channel; `press` thread e.thread; `set` reply, e.text; `key` Return | one reply in e.thread |
| S9 two-app form | per page: `set` fields from CU Ledger values in e; fix the two seeded errors; `press` next; final `press` submit with consent approved | submitted record equals e, two errors seen |
| S10 hover value | `hover` (new) point e.point | none: the answer names e.value |
| S11 keypad code | `press` key-d for each digit of e.code; `press` ok | presses equal e.code, then ok |

New step kinds for the scripted runner: `scrollTo`, `click` with modifiers, `hover`, and `drag` with a modifier.
Plans that approve a consent run only in the scripted dry pass, never in a model row.

## Read next

[third-batch-screens](third-batch-screens.md).
