---
title: ULTIMATE_GOAL 2.0 verdict, row by row - live, in progress
created: 2026-11-02T10:22:00Z
modified: 2026-11-08T14:28:42Z
level: L1
version: 0.9.52
description: cu-verifier's per-row state of the desktop ULTIMATE_GOAL after the owner's grant - live evidence so far from the runbook on the Mac mini beside the pre-grant verifiers, and what each row still needs. No row is held until its live half holds.
status: unverified
grounded_in:
  - source: ULTIMATE_GOAL.md@2.0.0
  - source: github.com/dtadpole/computer-use/_verifiers_/INDEX.md
  - source: _team_members_/cu-verifier/evidence-audit.md@1.0.0
---

# ULTIMATE_GOAL 2.0: live, in progress (CUHelper 0.2.52, dtadpole/computer-use)

Seven of nine rows hold live. Consent and safety does not hold yet. The two Urgent holes behind D-071 closed live:
CU-230 (modified paste chords; desktop and browser rows) and CU-232 (a chord judged as the menu item it fires, on
helper 0.2.52's menu read; Send, the hidden duplicate, the lazy menu and Mail's plain Delete all ask). CU-234's six
cells have closing runs, and CU-226 was measured with no stale read (0/144). Red teaming keeps finding D-063 under-asks,
most with fixes landed or in review, live rows next: typed secrets and token formats (CU-245, CU-257), chunked typing
(CU-267), look-alike names (CU-266), Services (CU-249, CU-250), a chat app's Return (CU-253), standing choices
(CU-258), actions that reach others and account protection (CU-261, CU-270), a menu Open of a script (CU-252), a
secret in a navigate URL (CU-260), non-web link schemes (CU-265), and an IDE's Run (CU-271). Then CU-135's Replace chain
with the owner (#1, on main). Human control waits for step 4 with the owner (CU-11). Runs sit on each claim's CU issue,
re-proven by the [evidence audit](evidence-audit.md) (CU-53).

| Row | Live evidence | State |
|---|---|---|
| environment | signed helper 0.2.52 (main e7872c7, sha256 231fca6f): self-test, peer, entry and second-helper refusals; one desktop run at a time, enforced hold (CU-75), owner idle first; after each install: contents, Q-D15 (5/5), step 4 | holds |
| perception | scale 1 at 1920x1080, 100+ runs; simulated Retina: precision 24/24 at 1.04 and 1.32 px/pt, keypad 18/18 across 1, 1.04 and 1.32, 42 rows re-judged with 0 discrepancies (CU-61, CU-70, CU-71, CU-74, CU-81, CU-83) | holds; a real Retina or second display not shown |
| action contract | click, double-click, type, chords, drag, menus, scroll, right-click, timed holds, button down and up (CU-64); a drag crossing another app is refused (CU-36) | holds; the bare-desktop crossing is dry-run only |
| agent loop | Sonnet and Opus unattended: 74 rows (CU-8) and 76 on 0.2.25, re-judged with 0 discrepancies; screenshot pruning is off by default when turns carry thinking (CU-65, CU-84) | holds |
| consent and safety | injections 36/36 and 24/24 held; overlays, same-named apps, mid-drag windows, the owner's clipboard (CU-62) and system prompts (CU-76, CU-77) handled; D-059 routes each asserted beside a mutant, closed cells bound to their closing run (CU-145, D-064); sensitive classes closed live, main before each fix typing them unasked (CU-163, CU-164, CU-167, CU-172, CU-178, CU-179, CU-183, CU-185, CU-186, CU-187, CU-192, CU-194, CU-196); drags and copies carry their text's and caption's class, read-only text views included (CU-195, CU-198, CU-209, CU-223); a missing pasteboard count asks (CU-220); modified paste chords are pastes (CU-230); a chord is judged as the menu item it fires, and an unreadable menu asks (CU-232); modifier variants of judged keys (CU-234); system shortcuts and owner-setting hotkeys refused, pressed or held (CU-242, CU-244, CU-251); a click inside a control judged as it (CU-175, CU-176, CU-180); a focus click takes no class (CU-170); a bare Reply asks only after text is entered (CU-157); an unread default button asks (CU-190) | does not hold yet: the D-063 under-asks named above, then CU-135's chain at step 4. Named limits (consent-limits.md once #34 lands): a web page's own shortcut keys are judged by the focused element (CU-241, D-072); Safe Browsing never warns here; a custom-drawn editor beside an empty entry is not seen; a desktop window with no entry asks a bare Reply; a clickable card is judged by its own words |
| human control | live view pause, take over, hand back, stop (CU-12); owner-step4.mjs re-confirmed on each helper | open: step 4 with the owner (CU-11; G2, CU-119) |
| integration | DSH and heddle each completed a fixture task (CU-15) | holds |
| trajectory | capture privacy; live-view frames stay in scope and the watch link cannot control (CU-12); latency and token use on every step (CU-54) | holds |
| evaluation | CU-8: 16/25 tasks per model, injections 12/12, 0 compromised (D-043); second batch Sonnet 16/21, Opus 17/21 clean, exclusions enforced in code (#149); third batch S1-S11 run live, S8 and S9 on Sonnet only - Opus waits for the owner (D-034) (CU-66) | holds; check 2 reads recorded builds from the private history checkout named in the local config (CU-222) |

## Read next

[evidence-audit.md](evidence-audit.md) (CU-53) and [ultimate-goal-verdict.md](ultimate-goal-verdict.md) (the browser verdict, 1.0).
