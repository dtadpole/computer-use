---
title: Sensitive classes - everything the agent must never type unasked
created: 2026-11-07T14:34:22Z
modified: 2026-11-08T14:16:00Z
level: L1
version: 0.3.3
description: The D-061 table - every sensitive class with its value rule, its field-name rule, the asserting test and the live row; rows live in an executable matrix, gaps are children of CU-145.
status: unverified
grounded_in:
  - source: D-061 and CU-171 (three sensitive-data gaps in one afternoon - CU-163, CU-164, CU-167)
  - source: _tests_/agent-core/sensitive-classes.test.mjs (the executable matrix)
  - source: 'the CU-171 probe of classify() on main and on #407'
---

# Sensitive classes

Typing a sensitive value is judged twice: by the value (a pattern with a check where one exists) and by the field's
name (on a text entry only, never a button). Each class has one row per value rule and per name in
`_tests_/agent-core/sensitive-classes.test.mjs`; todo rows only for open under-asks.

| Group | By value | By name (policy.mjs's lists, compared normalised) |
|---|---|---|
| Government IDs | SSN dashed; NI and PAN by issuing rules; Aadhaar (Verhoeff) and TFN (mod 11) in canonical spacing | SSN, social security or insurance, passport, driver's license, driving license, DL or license number, national insurance, NI number, national ID or identity, Aadhaar, tax file number; SIN, TFN, PAN, TIN, CPF, NRIC |
| Payment | card (Luhn), IBAN (mod-97), routing with account (ABA), EIN | card number or no, credit card, CVV, CVC, CSC, security code, expiry, exp date, expiration, valid thru, MM/YY, IBAN, account or acct number, routing, sort code, BSB, tax ID, number or identification, EIN, VAT number |
| Auth secrets | seed phrase (BIP39), 0x key, API and cloud keys | password, passcode, passphrase, PIN (credential); one-time, verification, 2FA and authenticator codes, OTP, recovery or seed phrase, mnemonic, private or secret key, API key, access token, secret |
| Personal | none: too broad | date of birth, birthdate, birthday, birth day, DOB, security question or answer, maiden name, Medicare, health insurance, policy number, medical record; NHS, MRN |
| Contact | email, phone (also national with a trunk 0, grouped: 020 7946 0958; CU-185) | email, phone, mobile, cell number, tel, telephone, street, address line, home, shipping, billing, mailing or postal address (D-062) |

## Limits

- Too broad to judge by value: a 9-digit SIN or plain SSN, a 3-digit CVV, an MM/YY expiry, a passport or licence
  number, a date, a street address. The name rule carries them, unseen when pasted into an unnamed box.
- A digest of 40 or more hex characters asks (accepted over-ask, D-061).
- Words match whole: 'Panel' never asks. A bare six-digit number never asks by value: a one-time code is
  judged by its field's name and autocomplete.
- Text typed into a sensitive field (Email and Phone too) is redacted from run files (D-062).
- Not judged by value: an unbroken national run (07700900123) and the 00 international prefix; a grouped
  reference such as 01-2345-6789 asks (CU-185).
- Names compare normalised (case, curly apostrophes, licence as license, # as number, no dots, a hyphen as a
  space). Acronyms match case-sensitively as whole words: 'Pan size' never asks. 'Mobile' alone asks, so 'Mobile app
  name' does too (accepted over-ask). A bare 'Account', 'Token', 'ID number', 'Address', 'City' or 'Postcode' never asks.
- Pieces typed into one field are judged whole (CU-267); a desktop paste adds no text to them (D-031).

## Sign-off

Live rows run on the fixture site's secret-fields pages (browser, no model, no desktop hold), each paired against the
main before its fix. Re-signed by cu-verifier, 8 November (main 309c60328): every closed row cites cu-verifier's run or a
decision (D-064); none open. An open under-ask is an open or todo row naming its issue (D-063: team CU,
not done).
