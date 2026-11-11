---
title: probe-kit
created: 2026-11-09T23:30:00Z
modified: 2026-11-09T23:30:00Z
version: 0.1.0
description: "CU-384 (D-100): target and context builders shaped as the drivers and the loop send them, and the real deciding components, so a consent policy probe judges the shape a run will see; a drift test fails when a producing file stops naming a field."
grounded_in:
  - source: _context_/team-operations/decision-log.yaml (D-100 - a probe builds its target as the driver sends it and runs the real deciding components)
  - source: Linear CU-384 (cu-researcher's 9 Nov reflection - four probe slips were assumed shapes)
---

# `probe-kit`

Writer: cu-researcher. Node 24, no npm, no browser, no model. A probe is a policy-level check: it says what the
policy decides for a shape, not what a live run does; name it a policy probe in a filing (D-098).

| File | What it does |
|---|---|
| [`shapes.mjs`](shapes.mjs) | `web.*` and `desk.*` targets, `ctx.*` contexts (boundMenuItem, selection, typeOptions, paste, dropTarget and dragSource) and `act.*` actions, in the drivers' and loop.mjs's field names; `SOURCES` lists the file that produces each field |
| [`policies.mjs`](policies.mjs) | `webPolicy(allow)` (createPolicy over the real createSitePolicy), `deskPolicy(apps)` (createAppPolicy over a real approvals store in a temp folder, with `dispose()`), `verdict`, and `check(rows)` |
| [`matrices/`](matrices/) | kept red-team matrices on the kit: [`cu370-select.mjs`](matrices/cu370-select.mjs), [`cu377-file-into-app.mjs`](matrices/cu377-file-into-app.mjs), [`cu381-delete-key.mjs`](matrices/cu381-delete-key.mjs); each prints the rows that disagree and exits 1 when any does |

Rules for a probe built here: take every target from a builder (add a field to `shapes.mjs` and `SOURCES` with its
producing file, never inline); read a context field's name from loop.mjs before adding it; read every output field of
the verdict (`class`, `classes`, `alsoNeeds`, `approvalKey`, `runOnly`, `askEachTime`). Secret-shaped values come from
[`../../_tests_/fixture-shapes/shapes.mjs`](../../_tests_/fixture-shapes/shapes.mjs), never literals.

The drift test is [`../../_tests_/probe-kit/`](../../_tests_/probe-kit/INDEX.md). A field still in review carries
`pending: '<PR>'`; once it lands, the test fails until the mark is dropped.

## Read next

[`../INDEX.md`](../INDEX.md).
