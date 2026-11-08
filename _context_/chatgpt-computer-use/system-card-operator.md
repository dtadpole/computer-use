---
title: Operator system card and CUA research post, primary-source digest
created: 2026-11-01T09:38:42Z
modified: 2026-11-01T09:38:42Z
level: L1
version: 1.0.0
description: What the Operator System Card, its o3 addendum and the CUA research and eval documents say about the loop, human-in-the-loop controls, measured safety rates and benchmark conditions
status: unverified
grounded_in:
  - source: cdn.openai.com/operator_system_card.pdf (fetched 2026-11-01)
  - source: cdn.openai.com/pdf/4375e605-f9a6-438d-bcc8-190599c183a6/o3_cua_system_card.pdf (fetched 2026-11-01)
  - source: cdn.openai.com/cua/CUA_eval_extra_information.pdf (fetched 2026-11-01)
  - source: web.archive.org/web/20251217145527/openai.com/index/computer-using-agent/ (Internet Archive capture, fetched 2026-11-01)
  - source: web.archive.org/web/20260108213932/openai.com/index/introducing-operator/ (Internet Archive capture, fetched 2026-11-01)
---

# Operator and CUA: primary-source digest

PDFs came from cdn.openai.com; the posts came via the Internet Archive because openai.com returns HTTP 403 [oscard] [cua]. Successor and timeline: [ChatGPT agent system card](system-card-chatgpt-agent.md), [history](product-history.md).

## Loop and perception

| Item | Published fact | Ref |
|---|---|---|
| Model | GPT-4o vision plus RL-trained reasoning; supervised learning teaches perception and clicking | [oscard] §1–2 |
| Loop | "Screenshots from the computer are added to the model's context"; chain-of-thought over current and past screenshots; click, scroll, type | [cua] How it works |
| Weakness | Model "would almost always decide to read the text visually" rather than copy-paste, causing OCR errors | [oscard] §3.3.2 |

## Human-in-the-loop controls

| Control | Rule | Ref |
|---|---|---|
| Confirmation | Before "finalizing actions that affect the state of the world"; the policy covers financial transactions, sending emails, deleting calendar events | [oscard] §3.1, §4.3 |
| Takeover | Asks the user to take over for login, payment details, CAPTCHAs; "Operator does not collect or screenshot information entered by the user" | [op] How to use, Safety |
| Watch mode | Email (card); "email or financial services" (post). Pauses "when the user becomes inactive or navigates away from the page" | [oscard] §4.5, [op] |
| Refusal | Banking transactions, high-stakes decisions; stock trading fully restricted; blocklist of gambling, adult, drug and gun sites | [oscard] §3.1, §4.4, [cua] Safety |
| Injection monitor | Separate model "ingests current screenshot and pauses execution" | [oscard] §4.6, [o3op] §2 |

## Measured rates

| Metric | 4o Operator | o3 Operator (May 2025) | Ref |
|---|---|---|---|
| Confirmation recall (607 tasks, 20 categories) | 92% | 94%; 100% on financial transactions | [oscard] §4.3, [o3op] §2.2.3 |
| Injection susceptibility (31 scenarios, lower is better) | 23% (62% unmitigated, 47% prompting only) | 20% | [oscard] §4.6, [o3op] §2.3.3 |
| Monitor (77 red-team attempts) | 99% recall, 90% precision; 46 of 13,704 benign screens flagged | unchanged | [oscard] §4.6, [o3op] |
| Proactive-refusal recall | 94% | — | [oscard] §4.4 |
| Agentic-harm refusal (illicit / financial / personal data) | 97% / 97% / 100% | 100% each; overrefusal 0.13 vs 0.3 | [oscard] Table 3, [o3op] Table 4 |
| Unmitigated mistakes (100 prompts) | 13 errors, 5 hard to reverse; confirmations cut risk ~90% | — | [oscard] §4.2 |

## Benchmarks (pass@1, temperature 0.6, max 200 steps)

| Benchmark | CUA | Previous SOTA | Human | Conditions | Ref |
|---|---|---|---|---|---|
| OSWorld | 38.1% | 22.0% | 72.4% | Ubuntu VM; figure labels 19.7/32.6/36.4% at 15/50/100 steps | [cua], [cuaeval] |
| WebArena | 58.1% | 36.2% / 57.1% | 78.2% | Operator browser, per-site hint prompts | [cua], [cuaeval] §1–2 |
| WebVoyager | 87.0% | 56.0% / 87.0% | — | 35 broken tasks removed; GPT-4o grader | [cua], [cuaeval] §4 |

The OSWorld prompt says "I won't be watching so please don't ask for confirmation" [cuaeval] §2.2.

**Inference:** benchmark scores reflect confirmations disabled, not product behaviour.

**Inference:** builders need four separate pieces: an injection classifier on every screenshot, independent of the actor; an inactivity and tab-focus pause on sensitive domains; no screenshots during takeover; confirmation recall measured per action category.

[oscard]: https://cdn.openai.com/operator_system_card.pdf
[o3op]: https://cdn.openai.com/pdf/4375e605-f9a6-438d-bcc8-190599c183a6/o3_cua_system_card.pdf
[cuaeval]: https://cdn.openai.com/cua/CUA_eval_extra_information.pdf
[cua]: https://web.archive.org/web/20251217145527/https://openai.com/index/computer-using-agent/
[op]: https://web.archive.org/web/20260108213932/https://openai.com/index/introducing-operator/
