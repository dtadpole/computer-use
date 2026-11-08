---
title: Consent routes - every way an action reaches a control, and how it is judged
created: 2026-11-07T03:26:33Z
modified: 2026-11-08T13:09:00Z
level: L1
version: 1.1.2
description: The D-059 audit table - single-action cells live in an executable matrix; this note lists the composed routes judged in the loop, the open cells and the sign-off rule; the named limits are in consent-limits.md.
status: unverified
grounded_in:
  - source: D-059 and CU-145 (five consent holes in one day)
  - source: _tests_/agent-core/consent-routes.test.mjs (the executable matrix)
  - source: driver-action-routes.md (#330) and cu-developer-one's browser route list
  - source: cu-verifier's sign-off checklist, 2026-11-07
---

# Consent routes

Single actions are cells of
`_tests_/agent-core/consent-routes.test.mjs`.

## Composed routes

Env: D desktop, B browser. Pin: the test (its mutant). Over-ask: 0 per asking row.

| Route | Env | Judged as | Pin (mutant) | Live |
|---|---|---|---|---|
| Tab (any repeat), Shift-Tab or arrow, then Space or Return - pressed, held or typed | D B | the settled focus; unsettled is opaque, asked | keyboard-activation (settle read removed) | 20261107T011840Z-418b44 (+2) |
| type holding a tab | D B | parts on the settled focus (#315, #329) | type-split (split desktop-only) | D 20261107T012323Z-c04596; B 20261107T042642Z-4af173 |
| mouse down ... up | D | one drag, judged at the press (CU-140) | loop-press-consent-pointer (composePresses bypassed) | 20261107T033152Z-d1a442 |
| long press; drag from a control | D | the press point | drag-press (press not judged) | 20261107T014520Z-2ad595 |
| travelling drag | D B | drop point by delete words, trash, bin; a text drag carries its entry's or caption's class (CU-183, CU-195); onto an entry, judged as a paste (CU-198) | drag-press (drop not judged) | 20261107T200523Z-06ce1f; CU-195 20261108T012741Z-5a5f14, D 092702Z-8a0307; CU-198 004646Z-a15df9; no fixture Trash zone |
| click or drag with held modifiers | D B | as the plain action | policy (modifiers skip judging) | seam only |
| right click, then a menu item | D B | the item's name | #335 (phrase dropped) | 20261107T180555Z-85b8d0 |
| Return or typed newline | D B (#337) | focused name, held dialog, default button (single-line or non-text focus); a text area's Return types unless in a chat app (CU-253) | #325, #334 (default button ignored) | D 20261107T173858Z-6c94df; B 20261107T172341Z-e8b869 |
| held page dialog, then Return or type | B | page_dialog plus the class its message names | policy (dialog ignored) | fixture-site dialog rows |
| Command chord in a text input | D | delete: a plain chord fires a bound menu first (CU-143) | #353 (plain exemption restored) | 20261107T053218Z-535da8 |
| Command-W or Q, then Command-D | D | Don't Save while a sheet is up (CU-148) | sheet-dont-save (sheet ignored) | 20261107T074411Z-2f170a |
| paste (keys, with Shift or Option too - CU-230; Edit menu; toolbar Paste) | D B | the owner's board asks; own copy by count (CU-151), at the focused field (CU-186, CU-192), with its source's class (CU-183; CU-196 menu copy; CU-187 caption; CU-223 read-only view) | paste-consent (count ignored); paste-chords (exact chord only) | 20261107T052454Z-bed1eb, 201801Z-5265f2, 213539Z-fda93b, 200526Z-fcaee3, 220120Z-666204, 215448Z-d562f6; D 024023Z-b216e7 |
| a menu key equivalent | D | also as a click on each bound item, stricter wins; an unreadable bar asks, editing chords spared (CU-232) | menu-key (bound item ignored) | open CU-232 |
| reload, back, forward onto a POST answer | B | submit (CU-153) | history-resubmit (resubmits unjudged) | 20261107T054200Z-d9a46e |
| panel commit; Go to Folder Return | D | file_choice; navigation only on positive evidence | panel-folder (arm without evidence) | 20261107T111700Z-a9c300 |
| "already exists - Replace?" | D | delete (CU-135) | keyboard-activation (Replace dropped) | 20261107T070122Z-828a8b; panel chain at step 4 |
| downloads, file chooser, permission prompts; a drop on another app or the Dock | B; D | refused | chrome-browser; scope check | refusal notices |

## Named limits

In [consent-limits.md](consent-limits.md) (D-063).

## Sign-off

Re-signed by cu-verifier, 8 November (main 309c60328): every closed cell cites cu-verifier's run or a decision
(D-064). Since: CU-209 and CU-223 closed (092702Z-8a0307, 103751Z-7762ec). Open: CU-135's save-panel
chain (owner session). Open under-asks: either table's open or todo rows (D-063). Every field a rule reads reaches
`classify()` on both paths (CU-152).
