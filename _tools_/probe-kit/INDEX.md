---
title: probe-kit
created: 2026-11-09T23:30:00Z
modified: 2026-11-12T05:38:15Z
version: 0.3.1
description: "CU-384 (D-100): target and context builders shaped as the drivers and the loop send them, and the real deciding components, so a consent policy probe judges the shape a run will see; a drift test fails when a producing file stops naming a field."
grounded_in:
  - source: _context_/team-operations/decision-log.yaml (D-100 - a probe builds its target as the driver sends it and runs the real deciding components)
  - source: Linear CU-384 (cu-researcher's 9 Nov reflection - four probe slips were assumed shapes)
  - source: _context_/team-operations/decision-log.yaml (D-103 - a fix that depends on a loop-derived field is probed through the loop)
  - source: Linear CU-458 (the review tools kept on the kit; cu-coordinator's go 20:36Z 11 Nov)
---

# `probe-kit`

Writer: cu-researcher. Node 24, no npm, no browser, no model. A probe is a policy-level check: it says what the
policy decides for a shape, not what a live run does; name it a policy probe in a filing (D-098).

| File | What it does |
|---|---|
| [`shapes.mjs`](shapes.mjs) | `web.*` and `desk.*` targets, `ctx.*` contexts (boundMenuItem, selection, typeOptions, paste, dropTarget and dragSource) and `act.*` actions, in the drivers' and loop.mjs's field names; `SOURCES` lists the file that produces each field |
| [`policies.mjs`](policies.mjs) | `webPolicy(allow)` (createPolicy over the real createSitePolicy), `deskPolicy(apps)` (createAppPolicy over a real approvals store in a temp folder, with `dispose()`), `verdict`, and `check(rows)` |
| [`loop.mjs`](loop.mjs) | D-103: `throughLoop({ kind, frontmost, apps, targets, focused, actions })` drives agent-core's runTask with its fake environment and a scripted model and returns each action event's status, class and rule; `lastStatus` reads 'declined' (asked) or 'done' (free) |
| [`sweeps.mjs`](sweeps.mjs) | Part of CU-458: the canonical-form sweeps. `FAMILIES` (quantifier, acknowledgement, 'I'm sure', glyph, label, compound, qualifier, scope, question, polite, curly; each `ruled` or not), `sweep(matrices)` wraps every asking row of ruled matrices in each form and lists the forms that go free, `ruledGaps(result)`; the CLI reads matrix JSON files `{ site, rows }` and exits 1 on a ruled gap. The matrices themselves stay private while their held-outs matter |
| [`reclass.mjs`](reclass.mjs) | Part of CU-458, the D-108 guard: `reclassMap(matrices, extra)` classifies every name on its own page for one tree; `reclassDiff(base, head)` lists asks `lost`, `gained`, `changed` and `narrowed` (a head class set missing a base class); `lostEquals(diff, ruled)` checks a lowering PR against its ruled list exactly. CLI `map` / `diff` (exits 1 on a loss or a narrowing) |
| [`heldout.mjs`](heldout.mjs) | Part of CU-458: `measure(set)` runs a private held-out set (web items on their page, dialog items with the dialog's words, desktop items by bundle id; classes may be 'a|b'; out-of-scope items reported apart); the CLI refuses a spent set and `--retire PR` marks it spent |
| [`lowering-check.mjs`](lowering-check.mjs) | Part of CU-458 (CU-429 rounds): `checkLowering(ruling)` - every LOWER item free, every KEEP item asking, every CLASS item with its ruled class, on one tree; pair it with the reclass diff so nothing else is lost |
| [`matrices/`](matrices/) | kept red-team matrices on the kit: [`cu370-select.mjs`](matrices/cu370-select.mjs), [`cu377-file-into-app.mjs`](matrices/cu377-file-into-app.mjs), [`cu381-delete-key.mjs`](matrices/cu381-delete-key.mjs), [`cu387-drag-through-loop.mjs`](matrices/cu387-drag-through-loop.mjs) (through the loop; its url-leaf row fails until PR #429 lands); each prints the rows that disagree and exits 1 when any does |

Rules for a probe built here: when the fix depends on a field loop.mjs derives, use `throughLoop`, not a hand-filled context (D-103) - a keypress's target is one (keyTarget, else the focus), so a key probe sets `focused`; take every target from a builder (add a field to `shapes.mjs` and `SOURCES` with its
producing file, never inline); read a context field's name from loop.mjs before adding it; read every output field of
the verdict (`class`, `classes`, `alsoNeeds`, `approvalKey`, `runOnly`, `askEachTime`). Secret-shaped values come from
[`../../_tests_/fixture-shapes/shapes.mjs`](../../_tests_/fixture-shapes/shapes.mjs), never literals.

The drift test is [`../../_tests_/probe-kit/`](../../_tests_/probe-kit/INDEX.md). A field still in review carries
`pending: '<PR>'`; once it lands, the test fails until the mark is dropped.

## Read next

[`../INDEX.md`](../INDEX.md).
