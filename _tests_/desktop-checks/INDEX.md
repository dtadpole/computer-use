---
title: desktop-checks test suite
created: 2026-11-06T15:20:00Z
modified: 2026-11-08T10:22:00Z
version: 0.2.0
description: Unit tests of the desktop live checks on fakes - the G1 check's guards, kill identity, post-kill checkpoint, release bounds, fallback and alert - with a virtual clock that fails a wait without a bound.
grounded_in:
  - source: _tools_/desktop-checks/INDEX.md@0.1.0
---

# `desktop-checks` suite

| File | Covers |
|---|---|
| [g1-held-keys.test.mjs](g1-held-keys.test.mjs) | every refusal before input, the pass, the kill identity, local input, inconclusive, fallback and alert, a hung run B, a marker left behind |
| [focus-after-click.test.mjs](focus-after-click.test.mjs) | CU-226: the plan's points and batch, reading a run's type judgements, the guards, consent-cells' targets on the offscreen fixture |

No helper or grant: every effect is a fake, and the fixture runs offscreen. Run: `node --test _tests_/desktop-checks/`.

## Read next

[`../INDEX.md`](../INDEX.md).
