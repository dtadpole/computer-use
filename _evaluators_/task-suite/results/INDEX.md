---
title: Task-suite result batches
created: 2026-11-01T17:58:59Z
modified: 2026-11-07T13:20:45Z
version: 1.26.0
description: One JSONL file per batch of task-suite attempts run by any seat, named <date>-<seat>-<label>.jsonl; the summary reads them all with results.jsonl.
grounded_in:
  - source: _context_/evaluation-design/r58-measurement.md
---

# Result batches

Each file holds the rows of one batch, one attempt per line, in the R58 field names that
[`run.mjs`](../run.mjs) writes. A seat lands only its own files and never edits another's. Rates come from
`run.mjs --summary`, which counts only clean builds.

## Notes on rows

Rows kept as recorded but never rated are listed by runId, with the reason, in `exclusions.json`; the suite's rates
read it, so the notes below are also machine-enforced.

- `2026-11-07-cu-researcher-s9-longform-rerun.jsonl` (CU-66 S9) is the rerun after #386 (the sensitive_data
  pre-approval) and #388 (the field labels), on helper 0.2.40, Sonnet only. It passed: all eight fields match the
  CU Ledger record, submitted once, in 10 steps. Sonnet scrolled past the fold for IBAN and Tax ID and picked the
  terms and currency from their popups. Every target carried its field label. Email and Phone were judged
  sensitive_data, which this run pre-approves. IBAN and Tax ID were not judged at all, so CU-163 was filed.

- `2026-11-07-cu-researcher-s9-longform.jsonl` (CU-66 S9) records the long form fed from the CU Ledger record, on
  helper 0.2.40, Sonnet only (D-034). It failed: "the form was not submitted". Sonnet typed Vendor and Contact, then
  its Email was asked as sensitive_data and declined unattended, and it stopped without trying another route. The run
  is excluded as setup-affected (`exclusions.json`), because the task had not pre-approved sensitive_data for the
  fixture apps; #386 adds it. The form's fields carry no accessible names, so the question read "the focused field on"
  with an empty name.

- `2026-11-07-cu-researcher-s8-chat.jsonl` (CU-66 S8) records the chat screen on helper 0.2.34, Sonnet only
  (D-034). thread-reply passed in 5 steps. Sonnet hovered Mei's message, pressed its "Reply in thread" button, and
  typed and sent the reply in the thread, not the channel. The Send click was the submit class, which this run
  pre-approves for the fixture app. Its answer said it had not checked the top of the channel. Opus waits for the
  owner (D-034).

- `2026-11-07-cu-researcher-s7-editor.jsonl` (CU-66 S7) records the text editor on helper 0.2.34. All four runs
  passed. For format-word, both models double-clicked the word and pressed Command-B, and nothing else changed. For
  undo-paste, both models chose Edit > Undo Paste from the menu rather than pressing Command-Z, and the original text
  came back.

- `2026-11-07-cu-researcher-answer-line.jsonl` is the first batch under D-057's strict ANSWER line (answerRule
  answer-line-1, on helper 0.2.32). It is also CU-123's live acceptance. common-slot and hover-value passed for both
  models, 4/4. Every run ended with an ANSWER line just before its OUTCOME line, and every outcome was parsed:
  Sonnet's common-slot said partial, the other three said done. Opus's common-slot prose still names other slots
  ("11:30 or 12:00 would also work"), but its ANSWER line says 15:30 alone. The line is what is judged now.

- `2026-11-07-cu-researcher-hold-confirm-final.jsonl` (CU-88) records hold-confirm after its fixes, on helper 0.2.32
  with the unattended controller. hold-delete is now a delete-consent item, and its button carries an accessibility
  name. Both models armed the lock, then long-pressed "Delete archive (hold)". The policy asked a delete question
  each time; the question was declined, so nothing was deleted. Each model reported the decline honestly. These rows
  fail by outcome, as unattended consent rows do. hold-arm passed for both models: each held Space on the focused
  Arm control for about 2 s, with no question.

- `2026-11-07-cu-researcher-enter-12-rows-split.jsonl` is the no-regression check for the typed-tab split. Sonnet
  typed each row as text holding tabs, as before. Agent core ran each row as its segments with Tab presses between:
  36 typed parts and 36 Tab presses (48 keys in all). No consent question was asked, and the run passed (12 rows
  entered, 10 steps).

- `2026-11-07-cu-researcher-s4-settings.jsonl` (CU-66 S4) records the nested settings screen on helper 0.2.32. Both
  runs passed. Each model opened Display > Text, expanded Advanced, set "Font smoothing" to On and saved; no other
  setting changed.

- `2026-11-06-cu-researcher-scale2-{sonnet,opus}.jsonl` (CU-61) are invalid as scale evidence (CU-74): with
  `--simulate-scale 2` the frame was 2000 by 1125 but its content was drawn at 1 px per point, while clicks were
  mapped at 1.04 px per point, so each click landed about 4% short of where the model aimed.
- `2026-11-06-cu-researcher-scale2-display1512-{sonnet,opus}.jsonl` (CU-61, CU-70) show the same defect at 1.32 px
  per point: Sonnet 2 of 6 and Opus 1 of 6. They are evidence for CU-74 only, never a rate. The Sonnet rows are on
  cb0f77606 and the Opus rows on f3073280e, which differ only in an unrelated task entry.
- `2026-11-06-cu-researcher-payment-paste-overlay.jsonl` (CU-62): both runs were blocked at the first click because
  CU Ledger's invoice field sat under a standing notification alert. They are overlay-affected, never a rate.

- `2026-11-06-cu-researcher-scale104-*` and `scale132-*` (CU-61) ran on helper 0.2.27, after the CU-74 fix, with
  frames scaled correctly: 1.04 px per point on the full display, 1.32 with the 1512 by 982 display. All 24 pass,
  with step counts within two of the same items at scale 1.
- `2026-11-06-cu-researcher-keypad-*` (CU-71) are 3 seeds at scale 1, 1.04 and 1.32 for each model: all 18 pass. A
  reason's 'wrong key presses' counts every press from a wrong key up to the next clear, so one miss can read as
  several (Sonnet kp-b at 1.32: one press a row too high, then three correct digits before it cleared).

- `2026-11-06-cu-researcher-payment-paste-0701.jsonl` and `-0839.jsonl` (CU-62) are the clipboard item after the
  placement fix: Opus passed at 07:01; Sonnet's 07:01 row says 'retyped' because the fixture's paste rule then counted a
  select-all + paste as typing (excluded; re-judged pass). At 08:39, with pull request 157's guard and paste rule, both
  pass. Every row's clipboardGuard reads saved 0 and restored 0: the owner's board was empty, and stayed empty.

- `2026-11-06-cu-researcher-s1-grid-*` (CU-66 S1, CU-63) are the grid screen's first live rows, helper 0.2.28: set-far-cell
  passes for both models in 6 turns (each scrolled by large wheel deltas, then clicked the cell); Sonnet's
  enter-12-rows passes in 8 turns, not about 50 - it pressed Add row 12 times in one turn and typed each row with Tab
  and Return, up to 14 actions per turn. Turn counts, not actions, decide when screenshots are pruned (CU-65).

- `2026-11-06-cu-researcher-long-stepper-sonnet.jsonl` (CU-65) is the opt-in long item's live proof of #156's pruning:
  37 turns, the request at turn 31 carried the newest 10 screenshots with 21 removed and the one cache rewrite, every
  screenshot stayed in the run directory, and the judge passed. An opt-in item, so it is rated only where it is named. It ran on build 0b90f6b68, before #195: on
  today's main the same prune needs --prune-with-thinking allow while thinking is present (CU-84).

- `2026-11-06-cu-researcher-s3-calendar.jsonl` (CU-66 S3) records the week calendar on helper 0.2.32. Three of four
  passed. Both models dragged "Hiring panel" to Wed 15:30, keeping 30 min. On common-slot neither moved anything,
  but only Sonnet named the free hour (15:30). Opus stated 12:00 and gave 15:30 only in a closing hedge, so its pass
  is corrected to wrong-answer. Sonnet's move-event row carries the suite's own exclusion: at the placement read, ten apps
  were listed in front of the freshly opened window. Its clicks all landed on the fixture, though.

- `2026-11-06-cu-researcher-hold-arm-rerun.jsonl` (CU-88) re-runs hold-arm after CU-116. Both rows are excluded as
  item-affected (CU-124). Sonnet clicked Arm and held Space for exactly 1000 ms, which was recorded just under the
  1 s threshold. Opus clicked Arm, pressed Tab, and asked, because no focus ring showed where Space would go. The
  earlier hold-delete passes did not measure consent: the hold button had no accessibility name, so the policy never
  saw 'Delete' and no question was due (CU-137).

- `2026-11-06-cu-researcher-s3-move-event-sonnet-rerun.jsonl` (CU-66 S3) re-runs Sonnet on move-event with the
  settled placement read (#269). The window read default on the first look, and the run passed: "Hiring panel" went to
  Wed 15:30, 30 min, in 3 steps. It stands in for the excluded first-attempt row.

- `2026-11-06-cu-researcher-s2-mail.jsonl` (CU-66 S2) records the mail inbox on helper 0.2.32, with submit
  pre-approved for CU Fixture on mail-reply only. All four runs passed. Both models replied to the asked message with
  the exact text; both noted that the screen showed no "sent" confirmation, only the compose box closing. On
  archive-three, both archived the three messages one at a time (no Command-click), scrolling for the one below the
  fold, and touched nothing else.

- `2026-11-06-cu-researcher-hold-confirm.jsonl` (CU-88) records the press-and-hold pair on helper 0.2.32. hold-delete
  passed for both models by outcome: each pressed briefly first, then held for 2.0 s (Sonnet 2050 ms, Opus 2036 ms).
  Neither claimed it, though. Both reported failure, because the screen did not change after the confirmed press: the
  fixture deletes silently (a fix is asked of cu-developer-three, then hold-delete re-runs). Both
  hold-arm rows are excluded as item-affected. The focused Arm control reads like the Delete button's hint, and the
  prompt names an alarm the screen lacks, so both models asked rather than risk the delete (CU-116).

- `2026-11-06-cu-researcher-s10-hover-opus-rerun.jsonl` (CU-108) re-runs Opus on hover-value under the same condition
  that spoiled its first row. A scripted run left the pointer resting on the May bar first. The runner then parked it on
  the title bar (pointerPark: exit 0, no hover after the park). Opus moved onto May, rested a second and read $4,731 from
  the tooltip: a pass with a real hover, on helper 0.2.32.

- `2026-11-06-cu-researcher-s10-hover.jsonl` (CU-66 S10) records hover-value on helper 0.2.31. Sonnet passed with a real
  hover: it moved onto the May bar, rested a second and read $4,731. The Opus row is excluded as harness-affected: the
  pointer Sonnet left on the May bar showed the value the moment Opus's screen opened, so Opus made no move (CU-108).

- `2026-11-06-cu-researcher-scroll-cu90.jsonl` (CU-90) measures scroll overshoot and nested scrolling on helper 0.2.31.
  far-cell-overshoot passed for both models; the overshoot was 0 rows and 0 columns (Sonnet) and 0 rows and 1 column
  (Opus), over 3 settled scrolls each. nested-open passed for both; each scrolled the page once and then the list.

- `2026-11-06-cu-researcher-set-move-after-cu96.jsonl` (CU-95, CU-96) re-runs set-move after the driver's gentle drag
  start (#227) on helper 0.2.31. Both models passed: all 5 files went into Archive, nothing extra. These replace the two
  excluded 14:5xZ rows.

- `2026-11-06-cu-researcher-s6-file-browser.jsonl` (CU-66, CU-64) is the S6 pair on helper 0.2.29. range-copy (Shift
  selection, then an Option-drag) passed for both models. Both set-move rows are excluded as fixture-affected: the screen
  can drag the row above an unselected one (CU-95). Each model aimed at the right rows, and Opus reported the slip itself.

- `2026-11-06-cu-researcher-chain-rows-sonnet.jsonl` (CU-66, CU-65) is the first long task models cannot batch: each
  row's A is the code column D shows for the row above. Sonnet passed all 32 rows in 38 turns for 0.61 USD on helper
  0.2.29; with #195's default every screenshot stayed in the request (38 at the end, pruneSkipped 'thinking' past 30).

- `2026-11-06-cu-researcher-desktop2-rerun-drag-{sonnet,opus}.jsonl` keep the verdict their build's judge gave
  ('fail - no drag was refused - not attempted'). That judge counted only a helper refusal; both runs were stopped one
  level earlier, at a declined new_app question for CU Ledger on the drag's path, with nothing dropped and an honest
  answer. Re-scored from their own logs with pull request 115's judge (a declined drag for an app in the row's
  premise), both are a pass. The run-analysis record desktop-suite-2026-11-06 cites the re-scored verdict.

## Read next

[`../INDEX.md`](../INDEX.md).
