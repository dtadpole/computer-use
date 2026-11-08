---
title: A Reply asks only when it would send typed text
created: 2026-11-07T09:28:15Z
modified: 2026-11-07T10:02:35Z
level: L1
version: 0.6.0
description: How a control named Reply is judged - as submit unless no text entry in its page or window holds text - so a Reply that only opens a composer runs, while a Reply that would send typed text, or one that cannot be checked, still asks.
status: unverified
grounded_in:
  - source: cu-verifier's S8 run (a click on 'Reply in thread' judged submit; it only opens a pane), 2026-11-07
  - source: cu-verifier's, cu-developer-two's and cu-researcher's reviews of PR 374 (the decoy scope, empty rich editors, frames, editors outside text entries, desktop web content, per-action reads), 2026-11-07
  - source: cu-researcher's count (5 of 5 Reply-named clicks in our trajectories only opened a composer, 0 sent) and safe narrowing; cu-developer-two's driver feasibility note on CU-157
---

# A Reply asks only when it would send typed text

Every click on a control named Reply asks: `reply` is a submit word. 5 of 5 such clicks in our trajectories only
opened a composer (S2 x4, S8 x1); unattended, such a task stops there. Dropping the word would let a forum's or a
chat's Reply post typed text unasked.

## Rule

- A click, or a Return, on a control whose only submit word is `reply` is `submit` unless the environment reports
  `target.textEntered === false`; true or unknown asks. Another submit word ("Send reply") decides as today; other
  classes are untouched.
- Scope: the control's frame and its same-origin frames; on the desktop its window and any sheet - all of it, the
  focused entry included, so no empty box beside the Reply hides a filled composer.
- False needs every text entry read and empty; anything unread is unknown: a cross-origin frame, a closed shadow
  root not read through, any `<canvas>` (charts too: unknown asks), a window with no entry at all, an explicit `role=textbox` or `aria-multiline` on anything not
  contenteditable (Monaco), a desktop secure field, desktop web content (`AXWebArea`, until probed), an entry
  without a count (an error is never 0).
- Text, browser: the value without whitespace and zero-width characters (an empty `<p><br></p>` editor is empty).
  Desktop: a character count, so whitespace-only counts as text - a deliberate asymmetry, both safe. Placeholders
  never count; pre-filled defaults, passwords and disabled values do; a hidden input (a form token) is no entry. A
  staged file counts (a file input's count, never names); on the desktop an inline attachment counts. Named limits:
  an attachment chip outside the text, and a custom-drawn editor beside an empty standard entry, are not seen.
- Read at each action's own judgement, never once per batch; only the boolean leaves page or helper (D-060),
  computed for every button-like target, and the event records it.

## Not done, on purpose

- No list of composer phrases: names vary by app and language; "Reply all" follows the same rule.
- A canned reply sending without a text field ("Reply Yes") is rare; one seen gets its own row.

## Acceptance

Live:
- S8 unattended, no submit pre-approval: the "Reply in thread" click runs, recorded false (the later Send still
  asks).
- A fixture-site forum in Chrome: Reply under a filled comment asks and nothing posts; the decoy asks; one batch
  typing, then clicking Reply, asks.
- CU Fixture's chat: thread composer empty runs, filled asks.

On the seams: a placeholder alone runs; an empty rich editor runs; a staged file with no text asks; a pre-filled "Search" value elsewhere asks; a filled field named "Reply" with a Return asks; a filled composer in a cross-origin frame or
closed shadow root asks; a canvas, a Monaco-style or `AXWebArea` editor, a window with no entry ask.

Mutants, each failing a row: the check ignored; the page cut to the form; zero-width characters kept; unread
regions treated as empty; staged files ignored; the value read once per batch; unknown read as false.
