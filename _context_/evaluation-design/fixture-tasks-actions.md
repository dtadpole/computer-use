---
title: Fixture tasks for actions and perception
created: 2026-11-01T10:00:00Z
modified: 2026-11-01T10:00:00Z
level: L1
version: 1.0.0
description: Nineteen local fixture tasks that exercise every computer action and the perception path, each with a machine-checkable pass condition, proposed to cu-verifier for the fixture site.
status: unverified
grounded_in:
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-01)
  - source: cdn.openai.com/cua/CUA_eval_extra_information.pdf (fetched 2026-11-01)
  - source: platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool (fetched 2026-11-01)
  - source: _tools_/fixture-site/contract.md (main d63fcd767)
---

# Fixture tasks: actions and perception

Each task is one fixture page whose own script reports state to `POST /__fixture/report`; the judge reads it through
the token-guarded state endpoint ([contract][fc]). A task passes only on the fixture's facts, never on the model's
final message (R48), and starts from a fresh state (R49). "Answer" tasks also compare the final answer. A1 to A3
already exist, from OpenAI's guide [tcu]; the rest follow WebArena and OSWorld task styles [cuaeval] and the
action set (R14) plus Anthropic's members [ant].

| ID | Task | Exercises | Pass when the fixture reports |
|---|---|---|---|
| A1 | `pickup-details` (exists) | click | details revealed for the drawn order |
| A2 | `visitor-badge` (exists) | click, type | badge created with the drawn name |
| A3 | `filters-search` (exists) | click, type, ENTER | Filters open and the drawn query searched |
| A4 | Pick a value in a native `select` and in a custom combobox | keypress, scroll | both hold the drawn value |
| A5 | Choose a date two months ahead in a calendar widget | repeated clicks | the field holds the drawn date |
| A6 | Report a code printed far down a long page | scroll | answer equals the code |
| A7 | Read a 9 px figure in a dense 60-row table | scroll, zoom (R12) | answer equals the figure |
| A8 | Reorder a sortable list into the drawn order | drag path | order matches |
| A9 | Set a range slider to the drawn value | drag to an exact point | value within one step |
| A10 | Select rows 3 to 7 with shift, then add row 10 with CTRL or META | `keys` on click (R16) | exactly that set selected |
| A11 | Double-click a cell, change it, press ENTER | double_click, type | cell holds the new value |
| A12 | Archive an item from its right-click menu | right button | item archived, no other change |
| A13 | Open a hover-only submenu and choose an entry | move | entry chosen |
| A14 | Replace a textarea's text using select-all | keypress mapping (R15) | text equals the drawn string only |
| A15 | Start a report, wait for the spinner, report the total | wait | answer equals the total |
| A16 | Follow a link that opens a new tab and finish there | tab handling | second page reports done |
| A17 | Fill a form inside a same-origin iframe | frame coordinates | form submitted with drawn values |
| A18 | Click a target drawn on a `canvas` | pixel accuracy (R10) | hit inside the target |
| A19 | Find the cheapest matching item across three result pages, put two in the cart | navigation, reading | cart holds two of that item, nothing else |

## Notes for the verifier

- Draw values from the seed so a run cannot pass by memory; keep every page free of agent-addressed text, because
  benign tasks must show zero inspector hits ([injection pages](injection-pages.md)).
- A7 and A18 also judge coordinate mapping: run them at 1280x800 and at a size that forces resizing (R9, R10).
- `false-success` (claimed done, facts say not) counts against a model separately from `fail`.

[fc]: ../../_tools_/fixture-site/contract.md
[tcu]: https://developers.openai.com/api/docs/guides/tools-computer-use
[cuaeval]: https://cdn.openai.com/cua/CUA_eval_extra_information.pdf
[ant]: https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool
