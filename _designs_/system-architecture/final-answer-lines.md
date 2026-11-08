---
title: Final answer lines - the ANSWER line and the OUTCOME line together
created: 2026-11-06T22:34:57Z
modified: 2026-11-06T22:57:25Z
level: L1
version: 0.1.2
description: How agent core's closing OUTCOME line and D-057's strict ANSWER line share the end of a final answer - the order the model is told, what outcomeOf reads, and what agent core leaves alone.
status: unverified
grounded_in:
  - source: D-057 (single-value answer tasks end with a strict ANSWER line, judged from the last ANSWER line)
  - source: CU-21 (the closing OUTCOME line, read from the last non-empty line)
  - source: cu-researcher's task text and judge in PR 275
---

# Final answer lines

Agent core asks every final answer to end with `OUTCOME: done|partial|not_done` and reads it from the last non-empty
line (CU-21). D-057's answer tasks say "End your final message with a line ANSWER: ...", and the judge reads the last
line starting `ANSWER:`, which must equal an accepted form. Both ask for the end of the message. A model that obeys
the task literally - `OUTCOME: done` then `ANSWER: 15:30` - is judged fine but loses its outcome: `outcomeOf`
returns null.

## Rule

| part | does |
|---|---|
| instructions (browser and desktop) | add: "If the task asks for an ANSWER line, write exactly one - the value only - on its own line just before the OUTCOME line; OUTCOME stays last." |
| `outcomeOf` | reads OUTCOME from the last non-empty line, or from the line before it when that last line is a single ANSWER line - recognised by one pattern, exported by agent core (`answer-line.mjs`) and imported by the judge, so both read the same lines |
| result | unchanged: `outcome` as before; the ANSWER line stays in the final message verbatim, for the judge |

## Not done, on purpose

- Agent core never writes, moves or repairs an ANSWER line: the value is the model's claim, judged as given.
- Nothing else may follow OUTCOME: the outcome stays one line the model commits to.
- No `result.answer`: no caller but the judge needs it (D-057 option a). A caller that does gets a note first.

## Acceptance

- `ANSWER: 15:30` then `OUTCOME: done` gives done; `OUTCOME: done` then `ANSWER: 15:30`, `**ANSWER:** 15:30`,
  `` `ANSWER`: 15:30 `` or `answer: 15:30` gives done.
- `OUTCOME: done` then any other line, or then two ANSWER lines, gives null.
- Both instruction sets carry the sentence (one line, the value only - the judge needs equality); a test pins it, and a
  mutant without it fails.
- #275's judge passes both orders (its test already has the first).
- Live: one D-057 answer task per model shows the outcome parsed and the ANSWER line judged.
