---
title: Desktop trajectory claims
created: 2026-11-02T09:45:36Z
modified: 2026-11-05T14:38:39Z
level: L1
version: 0.3.0
description: What the desktop-trajectory verifier claims through agent-core runs on the fake helper - no out-of-scope titles and no secure values in any run file, text toward a secure field redacted, and each completed action's mapping recorded.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0 (trajectory row)
  - source: _designs_/desktop-extension/trajectory-privacy.md@0.3.2
---

# Claims

| # | Claim | Mutant that must fail it |
|---|---|---|
| T1 | (element titles) An out-of-scope app's titles are in no run file, even when a stand-in helper leaks them | titles-everywhere |
| T2a | Typing into a secure field is handed to the person; nothing is sent; the field's value is in no run file | secure-typed |
| T2b | Text meant for a secure field is redacted as a credential in the run files (the transcript aside); holds since #205 | - |
| T3 | A completed action records its mapping (frame scale, origin); holds since #227 | - |
| T5 | A named secret, typed after a person approves the credential question and echoed back by the model, is scrubbed from events.jsonl, run.json, the result's final message and every line startRun hands to onEvent (#257); the secret did reach the helper | onevent-unscrubbed |
| T6 | An out-of-scope window the helper slips into its capture replies leaves its title in no run file, whether the driver refuses the frame (capture_leak) or carries on; the leaky helper's own log proves the leak was presented | - (a regression guard: titles from capture replies are never stored, so no single line breaks it) |

The leaky stand-in helper ([leaky-helper.mjs](leaky-helper.mjs)) puts a marker in every out-of-scope element and
window, so T1 judges agent core's own layer. The pixel half needs the real helper and the owner's grant.

## Read next

[INDEX.md](INDEX.md).
