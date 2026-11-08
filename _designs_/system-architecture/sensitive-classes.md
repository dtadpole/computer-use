---
title: Sensitive classes - everything the agent must never type unasked
created: 2026-11-07T14:34:22Z
modified: 2026-11-08T12:45:17Z
level: L1
version: 0.4.0
description: The D-061 table - every sensitive class with its value rule, its field-name rule, the asserting test and the live row; rows live in an executable matrix, gaps are children of CU-145.
status: unverified
grounded_in:
  - source: D-061 and CU-171 (three sensitive-data gaps in one afternoon - CU-163, CU-164, CU-167)
  - source: _tests_/agent-core/sensitive-classes.test.mjs (the executable matrix)
  - source: 'the CU-171 probe of classify() on main and on #407'
---

# Sensitive classes

A typed value is judged twice: by the value (a pattern, checked where possible) and by a text entry's name. Each
value rule and name is a row of `_tests_/agent-core/sensitive-classes.test.mjs`; todo rows mark open under-asks.

| Group | By value | By name (policy.mjs's lists, compared normalised) |
|---|---|---|
| Government IDs | SSN dashed or spaced, ITIN; NI and PAN by issuing rules; Aadhaar (Verhoeff) and TFN (mod 11) in canonical spacing | SSN, social security or insurance, passport, driver's or driving license, DL or license number, national insurance, NI number, national ID or identity, Aadhaar, tax file number; SIN, TFN, PAN, TIN, CPF, NRIC |
| Payment | card (Luhn), IBAN (mod-97), routing with account (ABA), EIN | card number or no, credit card, CVV, CVC, CSC, security code, expiry, exp date, expiration, valid thru, MM/YY, IBAN, account or acct number, bank account, debit card, routing, sort code, BSB, tax ID, number or identification, EIN, VAT number |
| Auth secrets | seed phrase (BIP39), 0x key, API and cloud keys, PEM or PGP private key, JWT | password, passcode, passphrase, PIN (credential); one-time, verification, 2FA and authenticator codes, OTP, recovery or seed phrase, mnemonic, private, secret or recovery key, backup codes, API key, access token, secret |
| Personal | none: too broad | date of birth, birthdate, birthday, birth day, DOB, security question or answer, maiden name, Medicare, health insurance, policy number, medical record; NHS, MRN |
| Contact | email, phone (also national with a trunk 0, grouped: 020 7946 0958; CU-185) | email, phone, mobile, cell number, tel, telephone, street, address line, home, shipping, billing, mailing or postal address (D-062) |

## Limits

- Too broad to judge by value: a 9-digit SIN or plain SSN, a 3-digit CVV, an MM/YY expiry, a passport or licence
  number, a date, a street address. The name rule carries them; a date or street address pasted into an unnamed box is not seen.
- A digest of 40 or more hex characters asks (an accepted over-ask, D-061 keeps it).
- Words match whole: 'Panel' and 'Classname' never ask. A bare six-digit number never asks by value; a one-time code is
  judged by field name and autocomplete.
- Sensitive-field text, Email and Phone included, is redacted from run files (D-062).
- Not judged by value: an unbroken national run (07700900123) or the 00 prefix; a grouped reference (01-2345-6789)
  asks (CU-185).
- Names compare normalised (case, curly apostrophes, licence as license, # as number, no dots, a hyphen as a
  space). Acronyms match case-sensitively as whole words: 'Pan size' and 'Sin City' never ask. 'Mobile' alone asks, so
  'Mobile app name' does too, as do 'Bank account holder' and a spaced reference fitting SSN or ITIN rules
  (accepted over-asks). A bare
  'Account', 'Token', 'ID number', 'Address', 'City' or 'Postcode' never asks.

## Sign-off

Live rows run on the fixture site's secret-fields pages, paired against main before each fix.
Re-signed by cu-verifier, 8 November (main 309c60328): every closed row cites cu-verifier's run or a decision (D-064).
Open since: CU-245's ten rows (asserted, #46). An open under-ask is an open or todo row naming
its issue (D-063).
