---
title: Browser environment claims
created: 2026-11-01T17:05:00Z
modified: 2026-11-07T05:49:34Z
level: L1
version: 1.2.0
description: What the browser-environment verifier claims about the chrome-browser driver - an isolated headless Chrome on a fresh profile with the sandbox on, the declared viewport, screenshots at the frame scale, and nothing left after close.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@1.0.0 (environment row)
  - source: _designs_/system-architecture/goal-checks.md@0.8.0 (browser-environment seed)
---

# Claims

| # | Claim | Outside evidence | Mutant it catches |
|---|---|---|---|
| E1 | One headless Chrome on a fresh `/tmp/cu-verifier-chrome-XXXXXX` profile, sandbox on, extensions off (R1, D-012) | the OS process table | `no-sandbox` |
| E2 | The page sees the declared 1024x768 viewport at device scale factor 1 | the viewport probe page | `wrong-viewport` |
| E3 | At scale 1 the screenshot is exactly the viewport | the PNG header, parsed by the check | - |
| E4 | Storage works within a run; close stops Chrome and removes its profile | the probe; the process table; the filesystem | `profile-kept` |
| E5 | The next run starts with no storage from the last one, and a 0.75 frame captures at 768x576 | the probe; the PNG header | `frame-scale-ignored` |
| E6 | A reload, back or forward onto a POST's direct (200) answer is asked as the submit it repeats and declined, 3 reload and 2 forward runs on fresh pages, one miss fails; a reload after post-redirect-get stays allowed (CU-153) | the fixture server's record of every POST it received | `history-unmarked` (driver), `resubmit-unjudged` (agent core); the race itself: see INDEX |
| E7 | A certificate warning on an allowed origin (a run --allowed onto an https site whose certificate Chrome does not trust) is handed to the person: the first action after it, of any kind, is not performed, and nothing reaches past it (CU-155) | the https server's own count of requests (a TLS failure sends none; clicking through would) | `interstitial-unrecorded` (driver), `interstitial-not-carried` (agent core) |

The driver runs as the CLI runs it: agent-core's site policy, resource gate (D-014) and run control. A resource
refusal is unjudged.

## Read next

[`INDEX.md`](INDEX.md).
