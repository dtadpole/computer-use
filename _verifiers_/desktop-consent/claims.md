---
title: Desktop consent claims
created: 2026-11-02T09:32:55Z
modified: 2026-11-08T11:36:36Z
level: L1
version: 0.8.0
description: What the desktop-consent verifier claims through real agent-core runs on the fake helper - excluded apps blocked without asking, unapproved apps asked about, approvals that take effect once, clipboard chords refused, consequential buttons paused.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0 (consent and safety row)
  - source: _designs_/desktop-extension/app-policy.md@0.3.2
---

# Claims

| # | Claim | Mutant whose own failure shows it |
|---|---|---|
| S1 | An excluded app under the pointer is blocked without asking, nothing is sent, and two blocks end the run | exclusion-ignored, two-block-rule-off |
| S2 | An app outside the scope raises new_app; a decline sends nothing | every-app-approved |
| S3 | Approved once, the click goes through and the helper's scope grows; the next run asks again | - (fails today: the scope never grows) |
| S4a | System-wide chords stay refused (P9): the app switcher, Spotlight, log out and lock screen are blocked as system shortcuts, pressed or held (CU-244), nothing sent | system-shortcut-allowed, held-chord-unjudged |
| S4b | Copy and cut in an approved app pass and reach the helper (D-031); a paste passes after the run's own copy and, with none first, asks (sensitive_data, CU-151) | clipboard-reblocked |
| S5 | A consequential button (Delete account) in an approved app asks; declined, nothing is sent | consequence-ignored |
| S6 | In an approved app, a terminal panel ('Terminal 1') takes a click, but typing into it is blocked with rule terminal_view and no text is sent (E5); skips until agent core knows the rule | terminal-typed |
| S7 | A piped y never approves (red team C1): the CLI refuses --consent tty without a terminal (exit 64), and a tty controller on a pipe declines the new_app question even when y is written the moment it is asked; nothing is sent | tty-from-pipe, cli-tty-unchecked |
| S8 | A pre-approval named for one app covers only that app, both as {class, app} and as the CLI's class@bundle.id ({class, origin}): the opaque click in CU Fixture goes through, the one in CU Ledger still asks and sends nothing | pre-approval-unbound |
| S9 | A start app the person has not approved is asked before the first capture (a new_app question naming it); unattended, the run ends declined and the helper is given no scope, capture or input (P11, #201, #264) | start-app-unasked |

Evidence is the run's own events.jsonl and run.json and the requests the helper received. Because S3 fails on the
real build, a mutant's exit code alone proves nothing; the proof is that each mutant also fails its own check.

## Read next

[INDEX.md](INDEX.md).
