---
title: macos-helper test suite
created: 2026-11-02T09:35:00Z
modified: 2026-11-02T09:35:00Z
version: 0.1.0
description: Tests of the Swift helper CUHelper.app - static checks of its sources, its Swift unit tests over the dry run, and the built helper driven over its socket and stdio - with no grant, no prompt and nothing on the display.
grounded_in:
  - source: _environments_/macos-desktop/helper/INDEX.md@0.2.0
---

# `macos-helper` suite

`node --test --test-timeout=90000 '_tests_/macos-helper/*.test.mjs'` from the project folder (about 30 s; the first
run builds into `/tmp/cu-helper-test-<hash>/`, later runs reuse it). Owner: cu-developer-three.

| File | Judges |
|---|---|
| [`helper-sources.test.mjs`](helper-sources.test.mjs) | no prompting, pasteboard or keychain API in the Swift code; gated calls only behind the grant check; the `CUSE` tag; the D-029 wiring; request tables, event fields and bundle id match the driver |
| [`helper.test.mjs`](helper.test.mjs) | the bundle and its signature; no prompting symbol linked; the Swift unit tests; `--selftest`; the socket hello and `not_granted` for every gated request; run-file modes; the 10 s connect window; the peer refusal and the one-helper lock; the dry run's tagged events, release of held input and frames; the driver's own link accepting the helper |
| [`UnitTests.swift`](UnitTests.swift) | compiled with the helper's sources: parsing, exclusions, capture sizes, the idle guard, CGEvents read back, held input, every dispatcher rule over a dry-run world, arguments, the peer decision |
| [`build.mjs`](build.mjs) | builds the bundle with `build.sh` (ad hoc) and the unit-test binary, cached by a hash of the sources |

Serving checks run with `--simulate-ungranted` or `--dry-run`, so even a host that holds grants captures and posts
nothing. The live-mode runs are the peer check and the one-helper lock (`--enforce-boundary`, refused before the
helper says anything) and, only on a host with no grant, a run served with every grant forced off.
