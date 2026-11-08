---
title: Vendored browser-use
created: 2026-11-05T14:54:59Z
modified: 2026-11-08T10:30:00Z
version: 1.2.0
description: browser-use's dependency-free Chrome DevTools client, copied unmodified from the owner's private knowledge repository so this repository runs standalone (CU-1).
grounded_in:
  - source: 'the owner''s private knowledge repository, browser-use project (revision 3a03e5d4f933, folder last changed in e44de50b58fc)'
  - source: 'Linear CU-3 (the verify runner, copied from the same commit)'
  - source: 'Linear CU-1, D-039 (computer-use moves to its own repository, 2026-11-05)'
---

# Vendored browser-use

The Chrome DevTools client the version-1 browser environment, the verify kit and the browser verifiers use:
`cdp.mjs` (the protocol over a pipe or socket), `chrome.mjs` (finding, starting and stopping Chrome) and
`lib.mjs` (the page helpers), with everything `lib.mjs` re-exports; and the shared verify runner (`_tools_/verify-runner/`: `run.mjs` runs one
check file and keeps the verdict contract, `lib.mjs` gives `skipUnless`), which every verifier's `verify.sh` and checks
use (CU-3). Node built-ins only, no packages.

**Provenance.** Copied byte for byte from the owner's private knowledge repository at revision `3a03e5d4f933`,
its browser-use project; that tree last changed the folder in `e44de50b58fc`. The files are the closure of the three
entry points' relative imports. The owner's own code (ported from heddle 619b8c1 on 2026-10-28).

**One exception (2026-11-08).** Five comment lines of `chrome.mjs` named an internal host and its PAC file; they
now say "an internal host" before publication. No code changed; the copy's original digest was `213be697544cbebc`.

**Rule.** Never edit these files here. To update, copy the same closure again from a newer revision of that repository and
rewrite this page's commit and digests; a local change would be lost silently at the next copy.

| File | Lines | SHA-256 (first 16) |
|---|---|---|
| [`actions.mjs`](actions.mjs) | 464 | `dfe15fd54a24411b` |
| [`browser.mjs`](browser.mjs) | 212 | `ab0fd0d69be2e4e7` |
| [`cdp.mjs`](cdp.mjs) | 325 | `5bbd883c0f08d6fa` |
| [`chrome.mjs`](chrome.mjs) | 642 | `0a13762b86c6fdb2` (comments scrubbed, see above) |
| [`emulate.mjs`](emulate.mjs) | 198 | `d203bdbad8174f71` |
| [`format.mjs`](format.mjs) | 202 | `75dc1e24dc6183d2` |
| [`lib.mjs`](lib.mjs) | 79 | `37636d92ddaa3f50` |
| [`page.mjs`](page.mjs) | 507 | `b6b3f63d4f1bede2` |
| [`snapshot.mjs`](snapshot.mjs) | 208 | `02f11ac0da29d5df` |
| [`tools.mjs`](tools.mjs) | 605 | `c5f456a26cc2f025` |
| [`_tools_/verify-runner/INDEX.md`](_tools_/verify-runner/INDEX.md) | 0 | `0f390be804bc61c7` |
| [`_tools_/verify-runner/lib.mjs`](_tools_/verify-runner/lib.mjs) | 0 | `a44d770c9ec4b623` |
| [`_tools_/verify-runner/run.mjs`](_tools_/verify-runner/run.mjs) | 6 | `e0309fcc3bdb2e8d` |
