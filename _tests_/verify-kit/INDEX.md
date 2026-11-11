---
title: Verify kit tests
created: 2026-11-01T09:33:46Z
modified: 2026-11-09T16:25:00Z
version: 1.14.0
description: The unit suite of the verify kit - the memory gate and guarded profiles, and the CDP input events each canonical action becomes.
grounded_in:
  - source: shared/_conventions_/core-conventions/working-agreements.md@1.5.1 (key functions carry test cases)
---

# Verify kit tests

| File | Judges |
|---|---|
| [browser-gate.test.mjs](browser-gate.test.mjs) | `parseMemoryFree`, `memoryGate`, `floorFromEnv`, `isThrowawayProfile`, a real `/tmp/cu-verifier-chrome-*` directory |
| [browser-registry.test.mjs](browser-registry.test.mjs) | the D-014 protocol against a temporary directory: entries, seat and team refusals, dead entries, lock wait and stale lock, exit cleanup |
| [check-browser.test.mjs](check-browser.test.mjs) | the start order and that every refusal gives back what was taken |
| [sut.test.mjs](sut.test.mjs) | loading the system under test, exact-once mutations, a real mutant built and removed without touching browser-use |
| [prove-failing.test.mjs](prove-failing.test.mjs) | verdict classes, the all-caught rule, leaked-profile detection |
| [desktop-evidence.test.mjs](desktop-evidence.test.mjs) | landing tolerance, pid and tag, the marker matcher, run-directory scans, the held key's release after the owner's press (CU-341 G2) |
| [helper-conformance.test.mjs](helper-conformance.test.mjs), [double-helper.mjs](double-helper.mjs) | each conformance check holds on a protocol double, over stdio and a socket, and fails on its breach |
| [helper-build.test.mjs](helper-build.test.mjs) | `buildCUHelper` on a stand-in helper tree: an aborted build leaves nothing at its cache path, a stale empty skeleton is replaced, a young one or one holding a file is left alone, a race lost to another run uses its build (CU-216) |
| [driver.test.mjs](driver.test.mjs) | `launchRefusal` names only a refused launch |
| [mcp-client.test.mjs](mcp-client.test.mjs) | line framing, replies by id, tool results, exit on stdin close |
| [png.test.mjs](png.test.mjs) | a round trip through every scanline filter, RGB and RGBA, refusals |
| [cdp-input.test.mjs](cdp-input.test.mjs) | key names and aliases, modifier bits, the events of each action, refusal by name |
| [build-sources.test.mjs](build-sources.test.mjs) | the local config read, the source order and where the history path may come from, `locateBuild`, `commitIn` on real temporary repositories, and evaluation-suite check 2 holding, failing and unjudged on a record set (CU-222) |
| [mutants-current.test.mjs](mutants-current.test.mjs) | every verifier's mutants still apply: each find text occurs exactly once in this tree (a changed line names its stranded mutant) |
| [d065-audit.test.mjs](d065-audit.test.mjs) | the D-065 citation parse and judgement with fakes: a deliberately wrong citation, a missing mutant and an uncited cell are each reported; a row id never matches as a prefix of another |

The plan runner's pure parts are judged in [`_tests_/fixture-site/plans.test.mjs`](../fixture-site/plans.test.mjs).

```bash
node --test _tests_/verify-kit/*.test.mjs
```

## Read next

[`../INDEX.md`](../INDEX.md).
