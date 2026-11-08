---
title: Sensitive classes - everything the agent must never type unasked
created: 2026-11-07T14:34:22Z
modified: 2026-11-08T18:16:05Z
level: L1
version: 0.4.6
description: The D-061 table - every sensitive class with its value rule, its field-name rule, the asserting test and the live row; rows live in an executable matrix, gaps are children of CU-145.
status: unverified
grounded_in:
  - source: D-061 and CU-171 (three sensitive-data gaps in one afternoon - CU-163, CU-164, CU-167)
  - source: _tests_/agent-core/sensitive-classes.test.mjs (the executable matrix)
  - source: 'the CU-171 probe of classify() on main and on #407'
---

# Sensitive classes

A typed value is judged twice: by the value and by a text entry's name. Each
value rule and name is a row of `_tests_/agent-core/sensitive-classes.test.mjs`; todo rows mark open under-asks.

| Group | By value | By name (policy.mjs's lists, compared normalised) |
|---|---|---|
| Government IDs | SSN dashed or spaced, ITIN; NI and PAN by issuing rules; Aadhaar (Verhoeff) and TFN (mod 11) in canonical spacing | SSN, social security or insurance, passport, driver's or driving license, DL or license number, national insurance, NI number, national ID or identity, Aadhaar, tax file number; SIN, TFN, PAN, TIN, CPF, NRIC |
| Payment | card (Luhn), IBAN (mod-97), routing with account (ABA), EIN | card number or no, credit card, CVV, CVC, CSC, security code, expiry, exp date, expiration, valid thru, MM/YY, IBAN, account or acct number, bank account, debit card, routing, sort code, BSB, tax ID, number or identification, EIN, VAT number |
| Auth secrets | seed phrase (BIP39), 0x key, API, cloud and dev-service tokens (CU-257), PEM or PGP private key, JWT | password, passcode, passphrase, PIN (credential); one-time, verification, 2FA and authenticator codes, OTP, recovery or seed phrase, mnemonic, private, secret or recovery key, backup codes, API key, access token, secret |
| Personal | none: too broad | date of birth, birthdate, birthday, birth day, DOB, security question or answer, maiden name, Medicare, health insurance, policy number, medical record; NHS, MRN |
| Contact | email, phone (also national with a trunk 0, grouped: 020 7946 0958; CU-185) | email, phone, mobile, cell number, tel, telephone, street, address line, home, shipping, billing, mailing or postal address (D-062) |

## Limits

- Too broad to judge by value: a plain SSN or SIN, a CVV, an MM/YY expiry, a passport or licence number, a date, a
  street address; names carry them.
- A 40+ hex digest asks (over-ask, D-061).
- Words match whole; a bare six-digit code goes by field name.
- Sensitive-field text, Email and Phone too, is redacted (D-062).
- An unbroken national phone run (07700900123) or a 00 prefix is not judged by value; a grouped reference asks (CU-185).
- Names compare normalised; acronyms match case-sensitively as whole words. 'Mobile app name', 'Bank account holder'
  and SSN-shaped references ask (accepted over-asks); a bare 'Account', 'Token' or 'City' never does.
- Names and values are normalised first (CU-266, CU-268): NFKC, invisible characters dropped, look-alikes folded,
  any script's digits as ASCII, letter-spacing closed up.
- An opened URL is judged (CU-260): a card, key or token in its query or fragment, or any password-, secret- or
  pin-named parameter's value, asks; a path id or a transformed or split value does not. A query email asks (over-ask).
- Pieces typed into one field are judged whole, detours and growth included (CU-267, CU-273); not across a click
  with the focus unreadable, a desktop paste (D-031), arrow or selection edits, or text it did not type.

## Sign-off

Live rows: fixture site's secret-fields pages.
Re-signed by cu-verifier, 8 November (main 309c60328): every closed row cites cu-verifier's run or a decision (D-064).
An open under-ask is an open or todo row naming
its issue (D-063).
