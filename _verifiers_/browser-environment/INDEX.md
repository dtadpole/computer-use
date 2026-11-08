---
title: Browser environment verifier
created: 2026-11-01T17:05:00Z
modified: 2026-11-07T05:49:34Z
version: 1.2.0
description: Judges the ULTIMATE_GOAL environment row on the chrome-browser driver from outside evidence - process table, viewport probe, PNG header, filesystem - and proves it fails on four broken builds.
grounded_in:
  - source: _designs_/system-architecture/goal-checks.md@0.8.0
  - source: _context_/team-operations/decision-log.yaml (D-012, D-014)
---

# Browser environment verifier

| File | What it is |
|---|---|
| [claims.md](claims.md) | the claims, their evidence, the mutant each catches |
| [check.mjs](check.mjs) | two driver launches: scale 1, then 0.75 on a fresh profile |
| [check-resubmit.mjs](check-resubmit.mjs) | claim E6 (CU-153): the system under test's CLI in real Chrome on the resubmit probe - reload and forward onto a POST's direct answer asked and declined, repeated on fresh pages; post-redirect-get allowed |
| [check-interstitial.mjs](check-interstitial.mjs) | claim E7 (CU-155): the system under test's CLI in real Chrome, --allowed onto a local https origin with a throwaway self-signed certificate (minted per run with openssl, no key kept) - the first action on the certificate warning is handed off, nothing reaches the server |
| [mutants.mjs](mutants.mjs) | four deliberately broken builds |
| [verify.sh](verify.sh) | the entry point; `CU_VERIFY_SUT` points it at another build |

```bash
_verifiers_/browser-environment/verify.sh
node _tools_/verify-kit/prove-failing.mjs _verifiers_/browser-environment
```

| Run, 2026-11-01, chrome-browser 29050c161 | Verdict |
|---|---|
| the build | 0, all 9 checks, about 50 s (E6's six CLI runs and E7's one) |
| `no-sandbox`, `wrong-viewport`, `profile-kept`, `frame-scale-ignored`, `history-unmarked`, `resubmit-unjudged`, `interstitial-unrecorded`, `interstitial-not-carried` | 1 each, each caught by its own check |

## Read next

[`../INDEX.md`](../INDEX.md).

## CU-153's race is not a mutant here, on purpose

The defect E6 was built for was a race: right at Page.frameNavigated Chrome can still report the previous history entry
as current, and the first build marked from that read. As a mutant (`history-race`: that first build restored), it was
caught in 1 of 5 prove-failing runs at 3 reload and 2 forward repeats - Chrome served a stale read in roughly 1 of 25
navigations on this machine (2026-11-07). A mutant caught by chance would make prove-failing flaky, so it is not in
mutants.mjs. The race is pinned deterministically one level down instead: chrome-browser's session tests force the stale
read (a history that still reports the previous entry, and one stale beyond the retry window), and the first build
fails them every time. E6 keeps the real-browser half: the POST answer marked at all (`history-unmarked`), and no
over-ask after post-redirect-get.
