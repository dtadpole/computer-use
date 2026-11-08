---
title: '[cu] Researcher - Handover'
created: 2026-11-08T04:16:21Z
modified: 2026-11-08T17:47:50Z
level: L2
version: 1.7.0
description: 'What a fresh session of [cu] Researcher needs - live state, open PRs and asks, the methods, and the next step.'
status: unverified
grounded_in:
  - source: the seat's own state, 2026-11-08 1440Z, main at c7daa04 (CU-232 verified live; D-071 lifted as D-074; CU-266 landed; helper 0.2.53 installed)
---

# [cu] Researcher - Handover

Start here, then [responsibilities](responsibilities.md) and [red-team-consent-tables](red-team-consent-tables.md).

```text
WHERE: one worktree ~/computer-use--cu-researcher; a branch per change from origin/main
(cu/cu-researcher-<topic>); never edit the main checkout (the DSH working directory). PRs land through
cu-integrator; numbers restarted at #1 on 8 Nov.

PUBLIC: the public-hygiene gate over origin/main..HEAD before every push; no home path, name, e-mail, internal
model id (alias model-a), host, session id, private address or key-shaped literal (fragments; shapes.mjs).

TABLES: D-059 consent-routes.test.mjs (class cells plus #48's app-policy section), D-061
sensitive-classes.test.mjs. Open PRs: #20, #30, #41, #43 (CU-245 name rows; #107 adds their class page), #48
(CU-249/250/254/256/277, CU-271's IDE rows), #51, #57, #63, #65, #68, #69, #73 (two terminal cells wait for a
live run after #109), #77, #79, #84; docs #34, #62, #71, #80, #81. The second lander flips a cell; a live run id
closes it (D-064).

AFTER LANDINGS: #98 flips cells in #48, #63, #68, #84; #115 drops consent-limits' data:/blob: clause; CU-250's
live row closes #48's service rows; CU-245's class-page run closes #43's six name rows.

REVIEWS DUE: CU-256, CU-271's desktop half, CU-273's four-box call, CU-254's Try Free, CU-277's live run for
Rewrite and Compose.

LESSONS: probe through runTask with a control that must ask; in the desktop-consent harness the focus goes in
world.focused; a cell must fail with its one field removed; a probe expects the exact verdict ('block:<rule>'),
never a prefix; a section's setup can fail asynchronously and drop its rows silently - see every merged branch's
rows in the run; commit before a detached test merge; node --check after a scripted edit that inserts strings;
run the doc tools with ~/.local/bin/python3 (Homebrew's lacks markdown_it, so the count prints blank); read -
not check - the inbox before every push; scope an OK to what was checked; docs follow the code.

RULES: never verify my own filings (CU-145..198, 223, 226, 228, 231, 232, 234, 240, 242, 244, 245, 249,
251-254, 256-258, 260, 261, 263-273, 278); send only --from cu-researcher; OKs by inbox as '#N OK at <sha>'.
D-034 20.69 of 25 USD: every live model run is announced with its cost first and logged on CU-66, the 21 USD
line holds, model-a on S8/S9 waits for the owner. D-074: no unattended task types, pastes or sends the owner's
data until the value-class Highs verify. No input outside CUHelper (D-056); reply to the owner in Chinese with
the todo list.
```
