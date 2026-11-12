---
title: Live rows tests
created: 2026-11-11T06:11:50Z
modified: 2026-11-11T06:19:25Z
version: 1.1.0
description: Unit tests for the live-row harness's pure half (row checks, pages, URLs, modes, cell count) and its done-check - no browser.
grounded_in:
  - source: Linear CU-458
---

# Live rows tests

Tests for [`_tools_/live-rows/`](../../_tools_/live-rows/INDEX.md). Run with
`node --test _tests_/live-rows/*.test.mjs`; none starts a browser.

| File | Covers |
|---|---|
| [rows.test.mjs](rows.test.mjs) | `validateRows`, the id kept out of the URL and page, `lines`, `rowUrl` / `rowIndexOf`, `pageHtml` per kind, `skipsReturn` / `cellCount`, `isInvalid`, `modeSteps` |
| [check.test.mjs](check.test.mjs) | `checkResults`: a clean set, a wrong class, a Return that differs, a post while declined, a missing cell, invalid cells ignored, a two-class match, an over-ask reported |
