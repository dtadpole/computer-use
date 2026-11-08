---
title: Fixture task catalogue
created: 2026-11-01T10:30:00Z
modified: 2026-11-01T18:43:50Z
level: L1
version: 1.3.0
description: The 27 fixture tasks outside the consent group - the skill each exercises and the state that makes its outcome hold.
status: unverified
grounded_in:
  - source: _tools_/fixture-site/tasks.mjs
  - source: developers.openai.com/api/docs/guides/tools-computer-use (fetched 2026-11-01)
---

# Task catalogue

Prompt values come from the seed. "Record" is server-side, "page" the page's own report; outcomes
describe the state now. The six consent tasks are in the [consent catalogue](consent-catalogue.md).

| Task | Skill | Holds when |
|---|---|---|
| `pickup-details` | OpenAI pickup example | details open (page); answer gives seeded locker and code |
| `visitor-badge` | OpenAI badge example | exactly one badge record named Mira |
| `filters-search` | OpenAI Filters example | panel open and search holds `penguin` |
| `filters-search-open` | same, panel starts open | the same, so clicking the toggle would undo it |
| `contact-form` | fields, radios, submit | one message record with every field (consent classes `submit`, `sensitive_data` for the address typed) |
| `native-select` | a native `select` | the country saved (headless popups ignore keys; Tab plus a letter works) |
| `custom-dropdown` | an ARIA listbox | the size added to the cart |
| `date-picker` | calendar, next month | the date confirmed |
| `settings-toggles` | checkboxes, radios | the latest saved settings match |
| `signup-wizard` | three steps | one workspace record with plan and company |
| `sign-in` | secret password | a successful login record; the password is never stored (`credential`) |
| `dismiss-modal` | close a modal | the article opened and no subscription record |
| `scroll-to-find` | scroll | only the product in the wishlist |
| `drag-card` | pointer drag | the card in Done, nothing else moved |
| `range-slider` | slider | the volume applied |
| `hover-menu` | hover | the report opened from the menu |
| `double-click-rename` | double-click | the file renamed, others unchanged |
| `keyboard-shortcut` | Ctrl+S | the note saved with the phrase |
| `context-menu` | right-click | only the file archived |
| `new-tab-terms` | new tab | one acknowledgement record |
| `iframe-promo` | iframe | the code applied inside the frame |
| `search-open` | search, navigate | the second result opened |
| `table-lookup` | read a table | answer gives the seeded extension |
| `canvas-target` | pixels only, no DOM target | the red circle hit on the canvas |
| `delayed-result` | waiting | the result shown; answer gives the code |
| `multi-select` | Shift and Cmd/Ctrl clicks | exactly the range plus one file archived |
| `small-print` | 9-pixel text | answer gives the fee |

## Read next

[`INDEX.md`](INDEX.md).
