---
title: chrome-browser test suite
created: 2026-11-01T09:52:00Z
modified: 2026-11-09T00:08:00Z
version: 0.11.0
description: Unit tests of the chrome-browser environment - keys, coordinates, input planning, clipboard, launching, request decisions, page scripts, the CDP session, the executor and the environment object - with no browser.
grounded_in:
  - source: _environments_/chrome-browser/INDEX.md@0.11.0
---

# `chrome-browser` suite

`node --test '_tests_/chrome-browser/*.test.mjs'` from the project folder; no browser or key; the proxy suite opens
loopback sockets. [`fake-cdp.mjs`](fake-cdp.mjs) is the fake CDP connection the session and environment suites use.

| File | Judges |
|---|---|
| [`keys.test.mjs`](keys.test.mjs) | coverage of `CANONICAL_KEYS`; both dialects; refusals; descriptors; chords |
| [`coords.test.mjs`](coords.test.mjs) | `fitScale` with Claude's limits, per-axis mapping, out-of-frame refusal, zoom clips |
| [`input-plan.test.mjs`](input-plan.test.mjs) | each action's CDP steps; no chord ever sends native copy, cut or paste (D-011); whole-batch refusal |
| [`errors.test.mjs`](errors.test.mjs) | error codes and shape |
| [`clipboard.test.mjs`](clipboard.test.mjs) | the run buffer; what copy reads from fields, passwords, selections, frames |
| [`launch.test.mjs`](launch.test.mjs) | profile paths and removal, flags without `--no-sandbox`, empty environment, sandbox detection |
| [`network.test.mjs`](network.test.mjs), [`proxy.test.mjs`](proxy.test.mjs) | request decisions failing closed; tunnels and upgrades allowed or refused before their target |
| [`human-input.test.mjs`](human-input.test.mjs) | a person's mouse, wheel, text and keys planned into CDP |
| [`page-scripts.test.mjs`](page-scripts.test.mjs) | hidden-text rules, shadow roots and frames, deep focus, element facts |
| [`session.test.mjs`](session.test.mjs) | pages, popups, cross-site frame sessions, dialogs; the executor's gate, signal, dialog rule, effects, settle, clipboard; proxy refusals classified |
| [`environment.test.mjs`](environment.test.mjs) | launch refusals, frame, dialog-time behaviour, targets (also inside a cross-site iframe), proxy lifetime, parity with the fake environment, screencast, human input, close |
| [`frame-focus.test.mjs`](frame-focus.test.mjs) | CU-300: the focus followed into a cross-site frame (inner field, `frameUrl`, `frameHost`, the frame's default button, one fingerprint with the click), every failed read keeping the iframe, an editable frame body, `defaultButtonRead`, one level only |

Behaviour in a real browser is checked by [`smoke.mjs`](../../_environments_/chrome-browser/smoke.mjs).
