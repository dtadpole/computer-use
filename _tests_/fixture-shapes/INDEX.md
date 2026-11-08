---
title: shared test fixtures
created: 2026-11-08T09:30:55Z
modified: 2026-11-08T09:30:55Z
version: 0.1.0
description: Helpers the component suites share - the key-shaped test values (card numbers, IBANs, SSNs, tokens, a private key, a recovery phrase, private IPv4 addresses) built at runtime from fragments, so no source file holds a literal a secret scanner would flag.
grounded_in:
  - source: human-authored
---

# `fixture-shapes`

Not a suite: modules the suites import. Nothing here runs under `node --test`.

| File | Holds |
|---|---|
| [`shapes.mjs`](shapes.mjs) | `j(...parts)` and `ip(...octets)`, and the named key-shaped values the policy, site-filter, browser and fixture-site suites type, paste, drag or match: `CARD`, `CARD_BAD_LUHN`, `CARD_DIGITS`, `IBAN_GB`, `IBAN_GB_BAD_CHECK`, `IBAN_GB_SHORT`, `IBAN_DE`, `IBAN_DE_COMPACT`, `SSN`, `SSN_NINES`, `SEED_TWELVE`, `SK_KEY`, `SK_LIVE_KEY`, `GITHUB_TOKEN`, `AWS_KEY_ID`, `PRIVATE_KEY_0X`. Each one is the same string, byte for byte, as the literal it replaced. |

Add a value here, built from fragments that do not match on their own, when a test needs a new secret-shaped literal.
Code outside `_tests_/` does not import this folder. The fixture site's pages join their own values inline.
