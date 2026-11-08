---
title: ULTIMATE_GOAL 2.0 verdict, row by row - live, in progress
created: 2026-11-02T10:22:00Z
modified: 2026-11-08T03:25:00Z
level: L1
version: 0.9.50
description: cu-verifier's per-row state of the desktop ULTIMATE_GOAL after the owner's grant - live evidence so far from the runbook on the Mac mini beside the pre-grant verifiers, and what each row still needs. No row is held until its live half holds.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0
  - source: github.com/dtadpole/computer-use/_verifiers_/INDEX.md
  - source: _team_members_/cu-verifier/evidence-audit.md@1.0.0
---

# ULTIMATE_GOAL 2.0: live, in progress (CUHelper 0.2.49, dtadpole/computer-use)

Seven of nine rows hold live. Consent and safety does not hold yet: one open High under-ask blocks it (D-063): CU-209's
desktop drag from a captioned read-only text view (after helper 0.2.51); both
tables signed, D-061 with no open row (CU-171), D-059 with that one cell. Then CU-135's Replace chain with the owner (#313). Human control waits for step 4
with the owner (CU-11). Runs sit on each claim's CU issue, re-proven by the
[evidence audit](evidence-audit.md) (CU-53).

| Row | Live evidence | State |
|---|---|---|
| environment | signed helper 0.2.49 (main ee2138e37): self-test, peer, entry and second-helper refusals; one desktop run at a time, enforced hold (CU-75), owner idle first; after each install: contents, Q-D15 (5/5), step 4 | holds |
| perception | scale 1 at 1920x1080, 100+ runs; simulated Retina: precision 24/24 at 1.04 and 1.32 px/pt, keypad 18/18 across 1, 1.04 and 1.32, 42 rows re-judged with 0 discrepancies (CU-61, CU-70, CU-71, CU-74, CU-81, CU-83) | holds; a real Retina or second display not shown |
| action contract | click, double-click, type, chords, drag, menus, scroll, right-click, timed holds, button down and up (CU-64); a drag crossing another app is refused (CU-36) | holds; the bare-desktop crossing is dry-run only |
| agent loop | Sonnet and Opus unattended: 74 rows (CU-8) and 76 on 0.2.25, re-judged with 0 discrepancies; screenshot pruning is off by default when turns carry thinking (CU-65, CU-84) | holds |
| consent and safety | injections 36/36 and 24/24 held; overlays, same-named apps, mid-drag windows, the owner's clipboard (CU-62) and system prompts (CU-76, CU-77) handled; D-059 routes each asserted beside a mutant, closed cells bound to their closing run (CU-145, D-064); sensitive classes closed live, main before each fix typing them unasked (CU-163, CU-164, CU-167, CU-172, CU-178, CU-179, CU-183, CU-185, CU-186, CU-187, CU-192, CU-194, CU-196); drags carry their text's and caption's class (CU-195, CU-198); a click inside a control judged as it (CU-175, CU-176, CU-180); a focus click takes no class (CU-170); a bare Reply asks only after text is entered (CU-157); an unread default button asks (CU-190) | does not hold yet: CU-209, then CU-135's chain at step 4. Named limits: Safe Browsing never warns here; a custom-drawn editor beside an empty entry is not seen; a desktop window with no entry asks a bare Reply; a clickable card is judged by its own words |
| human control | live view pause, take over, hand back, stop (CU-12); owner-step4.mjs re-confirmed on each helper | open: step 4 with the owner (CU-11; G2, CU-119) |
| integration | DSH and heddle each completed a fixture task (CU-15) | holds |
| trajectory | capture privacy; live-view frames stay in scope and the watch link cannot control (CU-12); latency and token use on every step (CU-54) | holds |
| evaluation | CU-8: 16/25 tasks per model, injections 12/12, 0 compromised (D-043); second batch Sonnet 16/21, Opus 17/21 clean, exclusions enforced in code (#149); third batch S1-S11 run live, S8 and S9 on Sonnet only - Opus waits for the owner (D-034) (CU-66) | holds |

## Read next

[evidence-audit.md](evidence-audit.md) (CU-53) and [ultimate-goal-verdict.md](ultimate-goal-verdict.md) (the browser verdict, 1.0).
