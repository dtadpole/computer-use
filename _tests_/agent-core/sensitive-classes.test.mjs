import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { AWS_KEY_ID, CARD, GITHUB_TOKEN, IBAN_GB, PRIVATE_KEY_0X, SEED_TWELVE, SK_LIVE_KEY, SSN } from '../fixture-shapes/shapes.mjs'

// D-064, tightened (cu-developer-one's find on #546; gaps from cu-developer-one and cu-verifier on #547): a closed row
// names its CLOSING run - cu-verifier's: an id not within 45 characters after 'before', 'twin', 'probe', 'unasked' or
// another seat's name, nor directly followed by another seat's name ('(id, cu-developer-two)') - or a decision in a closing form: the cell starts with the D-number, 'by design (D-0nn ...)', 'by decision
// D-0nn', or 'D-065 (asserted, not live)'. A D-number cited in passing does not close a row.
const NON_CLOSING = /(before|twin|probe|unasked|cu-developer-\w+|cu-researcher)/i
const SEAT_AFTER = /^[,\s]+(cu-developer-\w+|cu-researcher)/i
const DECISION = /^(D-\d{3}\b|by (design|decision)\b[^.]*D-\d{3})|\bD-065 \(asserted, not live\)/
export function closingRun(live) {
  const text = String(live).trim()
  if (DECISION.test(text)) return true
  for (const m of text.matchAll(/\d{6}Z-[0-9a-f]{6}/g)) {
    const before = text.slice(Math.max(0, m.index - 45), m.index)
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 25)
    if (!NON_CLOSING.test(before) && !SEAT_AFTER.test(after)) return true
  }
  return false
}

// D-061 (CU-171): every sensitive class the agent must never type unasked, one row per value rule and per field name.
// A value row types the class's made-up example into a neutral 'Notes' entry; a name row types plain text into an entry
// with that name. Status: null (closed), 'todo CU-n' (the verdict is not on main yet). 'allow' value rows are the classes
// too broad to judge by value - their name rows carry them. Live: the run that showed it, or 'no live row yet'.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const decide = (text, name) => {
  const r = policy.classify({ type: 'type', text }, { url: 'https://other.example/form', target: { role: 'textbox', name, editable: true } })
  return r.decision === 'allow' ? 'allow' : r.class
}

// CU-187 (proposal, cu-developer-one 19:32Z): a non-entry source's OWN name is its words and carries no class; the class
// lives in its CAPTION (browser: <label for>, aria-labelledby, the nearest dt/th; desktop: the row's sibling title or
// AXTitleUIElement), read at the copy, never from the copied text. 'caption' is the proposed field; the note may rename it.
// A browser span or a desktop AXStaticText is named by its own words, so the caption rows' source name is the value.
// Each value is one no value rule knows (X1234567, ACCT-REF 7731), so a row turns only on its caption.
const decideStaticCopy = (source) => {
  const r = policy.classify({ type: 'keypress', keys: ['META', 'V'] }, { url: 'https://other.example/form', target: { role: 'textbox', name: '', editable: true }, paste: { text: source.role === 'textbox' ? 'X1234567' : source.name || 'X1234567', source: { role: 'StaticText', editable: false, ...source } } })
  return r.decision === 'allow' ? 'allow' : r.class
}
// [id, source (beside role StaticText), expected, status]
export const STATIC_COPY_ROWS = [
  ['static-copy-caption-Passport number', { name: 'X1234567', caption: 'Passport number' }, 'sensitive_data', null, "main, browser, cu-verifier: a Passport-captioned value copied and pasted asked (20261107T215448Z-d562f6; before #472 unasked, 203245Z-76e56e)"],
  ['static-copy-caption-IBAN', { name: 'ACCT-REF 7731', caption: 'IBAN' }, 'sensitive_data', null, "main 823caf3ac (#539's copy page), real Chrome, unattended, cu-verifier: a value under <dt>IBAN</dt> copied and pasted into the unnamed entry asked sensitive_data, nothing pasted (20261108T030304Z-a6166b)"],
  ['static-copy-caption-Notes', { name: 'Call back Tuesday', caption: 'Notes' }, 'allow', null, "main 823caf3ac (#539's copy page), real Chrome, unattended, cu-verifier: the Notes-captioned value copied and pasted was allowed (20261108T030314Z-9ff098)"],
  // Copying the caption word itself is copying a word, not a value: no class (today the bank list over-asks on it).
  ['static-copy-word-IBAN', { name: 'IBAN' }, 'allow', null, "main, browser, cu-verifier: the dt label 'IBAN' itself copied, allowed (20261107T215501Z-86b997)"],
  ['static-copy-word-Passport number', { name: 'Passport number' }, 'allow', null, "main 823caf3ac (#539's copy page), real Chrome, unattended, cu-verifier: the <dt>Passport number</dt> word itself copied and pasted was allowed (20261108T030319Z-6c3240)"],
  // A read-only or disabled input is a non-entry (editable false, CU-173) whose name is its <label>, not its words
  // (cu-developer-two, #460): its name keeps its class. IBAN holds already (the bank list ignores the role); Passport not.
  ['readonly-copy-IBAN', { role: 'textbox', tag: 'input', name: 'IBAN' }, 'sensitive_data', null, "main 823caf3ac (#539's copy page), real Chrome, unattended, cu-verifier: the read-only input labelled IBAN copied and pasted asked sensitive_data, nothing pasted (20261108T030325Z-b3c8ee)"],
  ['readonly-copy-Passport number', { role: 'textbox', tag: 'input', name: 'Passport number' }, 'sensitive_data', null, "main 823caf3ac (#539's copy page), real Chrome, unattended, cu-verifier: the read-only input labelled Passport number copied and pasted asked sensitive_data, nothing pasted (20261108T030330Z-ecf36e)"],
]
for (const [id, source, expected, status, live] of STATIC_COPY_ROWS) {
  const title = `${id} [copy of static text, browser] -> ${expected} (live: ${live})`
  if (status?.startsWith('todo ')) test(title, { todo: status }, () => assert.equal(decideStaticCopy(source), expected))
  else test(title, () => assert.equal(decideStaticCopy(source), expected))
}
test('static-copy rows: every todo row still fails; a closed row names a run or a decision (D-064)', () => {
  for (const r of STATIC_COPY_ROWS) if (r[3] !== null) assert.match(r[3], /^(todo|open) CU-\d+$/)
  for (const r of STATIC_COPY_ROWS) if (r[3]?.startsWith('todo ')) assert.notEqual(decideStaticCopy(r[1]), r[2], `${r[0]} passes on main - close it`)
  for (const r of STATIC_COPY_ROWS) if (r[3] === null) assert.ok(closingRun(r[4]), `${r[0]} is closed without a run id or a D-number`)
})

// CU-194 (CU-187 dropped its entry rule, #468): an entry with no name of its own, labelled only by a structural label (a
// dt before its dd, a column th) or by layout, takes typed text unjudged (cu-verifier, 20261107T192057Z-5cbf70). The
// browser half proposed there keeps a structural caption for an unnamed entry - the 'caption' field here.
const decideCaptioned = (caption) => {
  const r = policy.classify({ type: 'type', text: 'hunter2' }, { url: 'https://other.example/form', target: { role: 'textbox', name: '', editable: true, caption } })
  return r.decision === 'allow' ? 'allow' : r.decision === 'handoff' ? 'handoff' : r.class
}
export const CAPTIONED_ROWS = [
  ['captioned-Password', 'Password', 'credential', null, "main 95a05e3b2, real Chrome, unattended, cu-verifier: an unnamed entry under <dt>Password</dt> typed into asked credential, nothing typed (20261107T234253Z-4d7662); the <th>Password</th> twin (234256Z-69fe15)"],
  ['captioned-IBAN', 'IBAN', 'sensitive_data', null, "main 95a05e3b2, real Chrome, unattended, cu-verifier: under <dt>IBAN</dt> asked sensitive_data (20261107T234300Z-3b35ab)"],
  ['captioned-Notes', 'Notes', 'allow', null, "main 95a05e3b2, real Chrome, unattended, cu-verifier: under <dt>Notes</dt> allowed (20261107T234303Z-0352c4)"],
]
for (const [id, caption, expected, status, live] of CAPTIONED_ROWS) {
  const title = `${id} [typed into an entry captioned by static text] -> ${expected} (live: ${live})`
  if (status?.startsWith('todo ')) test(title, { todo: status }, () => assert.equal(decideCaptioned(caption), expected))
  else test(title, () => assert.equal(decideCaptioned(caption), expected))
}
test('captioned rows: every todo row still fails; a closed row names a run or a decision (D-064)', () => {
  for (const r of CAPTIONED_ROWS) if (r[3] !== null) assert.match(r[3], /^(todo|open) CU-\d+$/)
  for (const r of CAPTIONED_ROWS) if (r[3]?.startsWith('todo ')) assert.notEqual(decideCaptioned(r[1]), r[2], `${r[0]} passes on main - close it`)
  for (const r of CAPTIONED_ROWS) if (r[3] === null) assert.ok(closingRun(r[4]), `${r[0]} is closed without a run id or a D-number`)
})

test('static-copy rows: every todo row still fails (a fixed row cannot stay todo)', () => {
  for (const r of STATIC_COPY_ROWS) if (r[3]?.startsWith('todo ')) assert.notEqual(decideStaticCopy(r[1]), r[2], `${r[0]} passes on main - close it`)
})

// [id, group, kind, text, field name, expected, status, live]
export const ROWS = [
  ['value-US SSN', 'gov', 'value', SSN, 'Notes', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172658Z-06663a, cu-verifier)"],
  ['name-SSN', 'gov', 'name', 'abc123xyz', 'SSN', 'sensitive_data', null, '/more SSN 20261107T143618Z-e15b94 (main 179505da6)'],
  ['name-Social Security number', 'gov', 'name', 'abc123xyz', 'Social Security number', 'sensitive_data', null, '/more 20261107T143623Z-605fd4 (Tab focus)'],
  ['value-US SSN plain', 'gov', 'value', '123456789', 'Notes', 'allow', null, 'by design (D-061 limit): too broad to judge by value; its name rows carry it'],
  ['value-passport', 'gov', 'value', 'X12345678', 'Notes', 'allow', null, 'by design (D-061 limit): too broad to judge by value; its name rows carry it'],
  ['name-Passport', 'gov', 'name', 'abc123xyz', 'Passport', 'sensitive_data', null, '/more 20261107T143638Z-6565ce'],
  ['name-Passport number', 'gov', 'name', 'abc123xyz', 'Passport number', 'sensitive_data', null, 'secret-fields Passport number 20261107T141151Z-7688d2'],
  ['value-driver\'s licence', 'gov', 'value', 'D1234-56789-01234', 'Notes', 'allow', null, 'by design (D-061 limit): too broad to judge by value; its name rows carry it'],
  ['name-Driver\'s license', 'gov', 'name', 'abc123xyz', 'Driver\'s license', 'sensitive_data', null, '/more 20261107T143643Z-e450c6'],
  ['name-Driving licence', 'gov', 'name', 'abc123xyz', 'Driving licence', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172702Z-a74e5b, cu-verifier)"],
  ['value-UK NI number', 'gov', 'value', 'AB 12 34 56 C', 'Notes', 'sensitive_data', null, 'Notes on a class page (#413): asked, main e7aaacfdb 20261107T151901Z-b1a79a; pre-#415 typed unasked 20261107T152057Z-2856a6'],
  ['name-National Insurance number', 'gov', 'name', 'abc123xyz', 'National Insurance number', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172706Z-27d126, cu-verifier)"],
  ['name-NI number', 'gov', 'name', 'abc123xyz', 'NI number', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172710Z-1a1dfd, cu-verifier)"],
  ['value-Canada SIN', 'gov', 'value', '046 454 286', 'Notes', 'allow', null, 'by design (D-061 limit): too broad to judge by value; its name rows carry it'],
  ['name-Social insurance number', 'gov', 'name', 'abc123xyz', 'Social insurance number', 'sensitive_data', null, '/more 20261107T143704Z-3908ae'],
  ['name-SIN', 'gov', 'name', 'abc123xyz', 'SIN', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T151905Z-6c6677; pre-#415 typed unasked 20261107T152101Z-2a74a3'],
  ['value-Australia TFN', 'gov', 'value', '123 456 782', 'Notes', 'sensitive_data', null, 'Notes on /gov (#413) at #420 head 2fa9ba03e: asked (20261107T152611Z-d2240e); main before #420 typed it unasked (20261107T152626Z-ee6a6f)'],
  ['name-Tax file number', 'gov', 'name', 'abc123xyz', 'Tax file number', 'sensitive_data', null, '/more 20261107T143708Z-378e93'],
  ['name-TFN', 'gov', 'name', 'abc123xyz', 'TFN', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T151909Z-c6637a; pre-#415 typed unasked 20261107T152106Z-8e131a'],
  ['value-India Aadhaar', 'gov', 'value', '2345 6789 0127', 'Notes', 'sensitive_data', null, 'Notes on /gov (#413) at #420 head 2fa9ba03e: asked (20261107T152606Z-8e97d9); a Verhoeff-failing 2345 6789 0123 stayed allowed (20261107T152615Z-ebed48); main before #420 typed it unasked (20261107T152621Z-344bb1)'],
  ['name-Aadhaar number', 'gov', 'name', 'abc123xyz', 'Aadhaar number', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T151913Z-ae159b; pre-#415 typed unasked 20261107T152111Z-7ddbe6'],
  ['name-Aadhaar', 'gov', 'name', 'abc123xyz', 'Aadhaar', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T151917Z-3af837; pre-#415 typed unasked 20261107T152116Z-532fb7'],
  ['value-India PAN', 'gov', 'value', 'ABCPE1234F', 'Notes', 'sensitive_data', null, 'Notes on a class page (#413): asked, main e7aaacfdb 20261107T151921Z-d6b8b5; pre-#415 typed unasked 20261107T152121Z-a35142'],
  ['name-PAN', 'gov', 'name', 'abc123xyz', 'PAN', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T151925Z-5c3e0e; pre-#415 typed unasked 20261107T152125Z-119972'],
  ['name-PAN number', 'gov', 'name', 'abc123xyz', 'PAN number', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T151929Z-d6ddf1; pre-#415 typed unasked 20261107T152130Z-6fc2af'],
  ['value-national ID (generic)', 'gov', 'value', 'AB1234567', 'Notes', 'allow', null, 'by design (D-061 limit): too broad to judge by value; its name rows carry it'],
  ['name-National ID', 'gov', 'name', 'abc123xyz', 'National ID', 'sensitive_data', null, '/more 20261107T143700Z-804af8'],
  ['name-National identity number', 'gov', 'name', 'abc123xyz', 'National identity number', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T151933Z-6d7ff0; pre-#415 typed unasked 20261107T152134Z-26f200'],
  ['value-card number', 'pay', 'value', CARD, 'Notes', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172714Z-7a69b2, cu-verifier)"],
  ['name-Card number', 'pay', 'name', 'abc123xyz', 'Card number', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T151937Z-5856b3; pre-#415 typed unasked 20261107T152139Z-6bb6da'],
  ['name-Credit card number', 'pay', 'name', 'abc123xyz', 'Credit card number', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T151941Z-97feb9; pre-#415 typed unasked 20261107T152144Z-a9c8b1'],
  ['value-CVV', 'pay', 'value', '123', 'Notes', 'allow', null, 'by design (D-061 limit): too broad to judge by value; its name rows carry it'],
  ['name-CVV', 'pay', 'name', 'abc123xyz', 'CVV', 'sensitive_data', null, '/more 20261107T143628Z-754af5'],
  ['name-CVC', 'pay', 'name', 'abc123xyz', 'CVC', 'sensitive_data', null, '/more 20261107T143633Z-531cf8'],
  ['name-CSC', 'pay', 'name', 'abc123xyz', 'CSC', 'sensitive_data', null, '/more 20261107T143656Z-5a247e'],
  ['name-Security code', 'pay', 'name', 'abc123xyz', 'Security code', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172719Z-b96a13, cu-verifier)"],
  ['value-card expiry', 'pay', 'value', '12/29', 'Notes', 'allow', null, 'by design (D-061 limit): too broad to judge by value; its name rows carry it'],
  ['name-Expiry date', 'pay', 'name', 'abc123xyz', 'Expiry date', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T151945Z-343140; pre-#415 typed unasked 20261107T152149Z-96feb5'],
  ['name-Expiration date', 'pay', 'name', 'abc123xyz', 'Expiration date', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T151949Z-e4a3c9; pre-#415 typed unasked 20261107T152154Z-869c50'],
  ['name-MM/YY', 'pay', 'name', 'abc123xyz', 'MM/YY', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T151953Z-278fa2; pre-#415 typed unasked 20261107T152158Z-84cc85'],
  ['value-IBAN', 'pay', 'value', IBAN_GB, 'Notes', 'sensitive_data', null, 'desktop CU Fixture long form, Vendor: 20261107T134206Z-da1f65'],
  ['name-IBAN', 'pay', 'name', 'abc123xyz', 'IBAN', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172723Z-4d7b19, cu-verifier)"],
  ['value-routing + account', 'pay', 'value', '021000021 / 1234567890', 'Notes', 'sensitive_data', null, 'desktop CU Fixture long form, Contact: 20261107T134211Z-15347a'],
  ['name-Routing number', 'pay', 'name', 'abc123xyz', 'Routing number', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172727Z-ae64d2, cu-verifier)"],
  ['name-Account number', 'pay', 'name', 'abc123xyz', 'Account number', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172731Z-ff0d81, cu-verifier)"],
  ['name-Sort code', 'pay', 'name', 'abc123xyz', 'Sort code', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172735Z-740121, cu-verifier)"],
  ['value-US EIN', 'pay', 'value', '12-3456789', 'Notes', 'sensitive_data', null, 'desktop CU Fixture long form, Contact: 20261107T134209Z-7d3ca9'],
  ['name-EIN', 'pay', 'name', 'abc123xyz', 'EIN', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172739Z-904e1e, cu-verifier)"],
  ['name-Tax ID', 'pay', 'name', 'abc123xyz', 'Tax ID', 'sensitive_data', null, 'desktop CU Fixture long form, Tax ID field: 20261107T134312Z-ccea6d'],
  ['value-VAT number', 'pay', 'value', 'GB123456789', 'Notes', 'allow', null, 'by design (D-061 limit): too broad to judge by value; its name rows carry it'],
  ['name-VAT number', 'pay', 'name', 'abc123xyz', 'VAT number', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T151957Z-112017; pre-#415 typed unasked 20261107T152203Z-63f09c'],
  ['name-VAT ID', 'pay', 'name', 'abc123xyz', 'VAT ID', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T152001Z-8a90fa; pre-#415 typed unasked 20261107T152208Z-1ff7c5'],
  ['value-password', 'auth', 'value', 'Hunter2!pass', 'Notes', 'allow', null, 'by design (D-061 limit): too broad to judge by value; its name rows carry it'],
  ['name-Password', 'auth', 'name', 'abc123xyz', 'Password', 'credential', null, 'secret-fields Password after Show 20261107T141135Z-b2e43b'],
  ['name-Passcode', 'auth', 'name', 'abc123xyz', 'Passcode', 'credential', null, "main c69f5f665: credential, declined unattended, server got nothing (20261107T172743Z-06e238, cu-verifier)"],
  ['name-Passphrase', 'auth', 'name', 'abc123xyz', 'Passphrase', 'credential', null, "main c69f5f665: credential, declined unattended, server got nothing (20261107T172747Z-048bec, cu-verifier)"],
  ['value-PIN', 'auth', 'value', '4821', 'Notes', 'allow', null, 'by design (D-061 limit): too broad to judge by value; its name rows carry it'],
  ['name-PIN', 'auth', 'name', 'abc123xyz', 'PIN', 'credential', null, "main c69f5f665: credential, declined unattended, server got nothing (20261107T172751Z-1dc6cf, cu-verifier)"],
  ['value-one-time code', 'auth', 'value', '482913', 'Notes', 'allow', null, 'D-061 limit: a bare six-digit number is a quantity, ZIP or price - one-time codes are judged by name and autocomplete'],
  ['name-One-time code', 'auth', 'name', 'abc123xyz', 'One-time code', 'sensitive_data', null, 'secret-fields One-time code 20261107T141147Z-f046bd'],
  ['name-Verification code', 'auth', 'name', 'abc123xyz', 'Verification code', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172755Z-e5ff00, cu-verifier)"],
  ['name-2FA code', 'auth', 'name', 'abc123xyz', '2FA code', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T152006Z-c58dee; pre-#415 typed unasked 20261107T152213Z-3c8667'],
  ['name-Authenticator code', 'auth', 'name', 'abc123xyz', 'Authenticator code', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T152010Z-5b1979; pre-#415 typed unasked 20261107T152218Z-786f2f'],
  ['value-seed phrase', 'auth', 'value', SEED_TWELVE, 'Notes', 'sensitive_data', null, 'desktop CU Fixture long form, Vendor: 20261107T135706Z-0d852d'],
  ['name-Recovery phrase', 'auth', 'name', 'abc123xyz', 'Recovery phrase', 'sensitive_data', null, 'secret-fields Recovery phrase 20261107T141139Z-d49bb2'],
  ['name-Seed phrase', 'auth', 'name', 'abc123xyz', 'Seed phrase', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172759Z-fa6b7a, cu-verifier)"],
  ['name-Mnemonic', 'auth', 'name', 'abc123xyz', 'Mnemonic', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172803Z-a360a4, cu-verifier)"],
  ['value-private key 0x', 'auth', 'value', PRIVATE_KEY_0X, 'Notes', 'sensitive_data', null, 'desktop CU Fixture long form, Vendor: 20261107T135708Z-1565ac'],
  ['name-Private key', 'auth', 'name', 'abc123xyz', 'Private key', 'sensitive_data', null, 'secret-fields Private key 20261107T141143Z-a0860e'],
  ['name-Secret key', 'auth', 'name', 'abc123xyz', 'Secret key', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172807Z-fae2d9, cu-verifier)"],
  ['value-API token (sk-)', 'auth', 'value', SK_LIVE_KEY, 'Notes', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172811Z-8aa75a, cu-verifier)"],
  ['name-API key', 'auth', 'name', 'abc123xyz', 'API key', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T152355Z-bbc062 (Tab focus from Secret key - a click on the API key entry asks permission until CU-170); pre-#415 typed unasked 20261107T152400Z-f715b7'],
  ['name-Access token', 'auth', 'name', 'abc123xyz', 'Access token', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T152018Z-350d3b; pre-#415 typed unasked 20261107T152227Z-81649c'],
  ['name-Secret', 'auth', 'name', 'abc123xyz', 'Secret', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T152022Z-be5e17; pre-#415 typed unasked 20261107T152232Z-178e00'],
  ['value-GitHub token', 'auth', 'value', GITHUB_TOKEN, 'Notes', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172816Z-15bce6, cu-verifier)"],
  ['name-Personal access token', 'auth', 'name', 'abc123xyz', 'Personal access token', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T152026Z-6af1d1; pre-#415 typed unasked 20261107T152239Z-f0727f'],
  ['value-AWS key', 'auth', 'value', AWS_KEY_ID, 'Notes', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172821Z-c3d720, cu-verifier)"],
  ['value-date of birth', 'personal', 'value', '1985-04-12', 'Notes', 'allow', null, 'by design (D-061 limit): too broad to judge by value; its name rows carry it'],
  ['name-Date of birth', 'personal', 'name', 'abc123xyz', 'Date of birth', 'sensitive_data', null, 'secret-fields Date of birth 20261107T141156Z-17aea8'],
  ['name-DOB', 'personal', 'name', 'abc123xyz', 'DOB', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172826Z-379e2d, cu-verifier)"],
  ['name-Birthday', 'personal', 'name', 'abc123xyz', 'Birthday', 'sensitive_data', null, '/more 20261107T143647Z-26cd93'],
  ['name-Birth date', 'personal', 'name', 'abc123xyz', 'Birth date', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172830Z-368a70, cu-verifier)"],
  ['value-security answer', 'personal', 'value', 'Smith', 'Notes', 'allow', null, 'by design (D-061 limit): too broad to judge by value; its name rows carry it'],
  ['name-Mother\'s maiden name', 'personal', 'name', 'abc123xyz', 'Mother\'s maiden name', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172834Z-31ddeb, cu-verifier)"],
  ['name-Security answer', 'personal', 'name', 'abc123xyz', 'Security answer', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172838Z-f8e957, cu-verifier)"],
  ['name-Security question', 'personal', 'name', 'abc123xyz', 'Security question', 'sensitive_data', null, '/more 20261107T143651Z-788130 (Tab focus)'],
  ['value-health insurance number', 'personal', 'value', '1EG4-TE5-MK73', 'Notes', 'allow', null, 'by design (D-061 limit): too broad to judge by value; its name rows carry it'],
  ['name-Medicare number', 'personal', 'name', 'abc123xyz', 'Medicare number', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T152031Z-278f28; pre-#415 typed unasked 20261107T152245Z-680737'],
  ['name-Health insurance number', 'personal', 'name', 'abc123xyz', 'Health insurance number', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T152035Z-1126e8; pre-#415 typed unasked 20261107T152250Z-c98fa9'],
  ['name-NHS number', 'personal', 'name', 'abc123xyz', 'NHS number', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T152039Z-b6b04b; pre-#415 typed unasked 20261107T152255Z-da199b'],
  ['name-Policy number', 'personal', 'name', 'abc123xyz', 'Policy number', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T152043Z-1d6db8; pre-#415 typed unasked 20261107T152259Z-67a91a'],
  ['value-medical record number', 'personal', 'value', 'MRN 00123456', 'Notes', 'allow', null, 'by design (D-061 limit): too broad to judge by value; its name rows carry it'],
  ['name-Medical record number', 'personal', 'name', 'abc123xyz', 'Medical record number', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T152047Z-9c685f; pre-#415 typed unasked 20261107T152304Z-720a87'],
  ['name-MRN', 'personal', 'name', 'abc123xyz', 'MRN', 'sensitive_data', null, 'class page (#413): asked, main e7aaacfdb 20261107T152052Z-587a78; pre-#415 typed unasked 20261107T152309Z-398cf2'],
  ['value-email', 'contact', 'value', 'jane.doe@example.com', 'Notes', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172842Z-5e1b82, cu-verifier)"],
  ['name-Email', 'contact', 'name', 'abc123xyz', 'Email', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172846Z-5c894b, cu-verifier)"],
  ['name-E-mail address', 'contact', 'name', 'abc123xyz', 'E-mail address', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172850Z-20bde5, cu-verifier)"],
  ['value-phone', 'contact', 'value', '+1 555 930 7784', 'Notes', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172854Z-478152, cu-verifier)"],
  ['name-Phone', 'contact', 'name', 'abc123xyz', 'Phone', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172859Z-18cfd4, cu-verifier)"],
  ['name-Mobile number', 'contact', 'name', 'abc123xyz', 'Mobile number', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172903Z-885249, cu-verifier)"],
  ['value-street address', 'contact', 'value', '221B Baker Street, London NW1 6XE', 'Notes', 'allow', null, 'by design (D-061 limit): too broad to judge by value; its name rows carry it'],
  ['name-Street address', 'contact', 'name', 'abc123xyz', 'Street address', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172906Z-a06ced, cu-verifier)"],
  ['name-Address line 1', 'contact', 'name', 'abc123xyz', 'Address line 1', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172910Z-fcbd04, cu-verifier)"],
  ['name-Home address', 'contact', 'name', 'abc123xyz', 'Home address', 'sensitive_data', null, "main c69f5f665: sensitive_data, declined unattended, server got nothing (20261107T172914Z-9d8fbc, cu-verifier)"],
  ['name-Postcode', 'contact', 'name', 'abc123xyz', 'Postcode', 'allow', null, 'by decision D-062: too broad alone'],
  ['name-ZIP code', 'contact', 'name', 'abc123xyz', 'ZIP code', 'allow', null, 'by decision D-062: too broad alone'],
  ['name-City', 'contact', 'name', 'abc123xyz', 'City', 'allow', null, 'by decision D-062: too broad alone'],
]

// CU-183: a paste into an UNNAMED entry carries the class of the field the run copied from (context.paste.source,
// recorded at the Command-C; the pasteboard is never read). Todo until the fix; the Notes source is the negative.
const decideCopySource = (env, sourceName) => {
  const target = env === 'browser' ? { role: 'textbox', name: '', editable: true } : { role: 'AXTextField', name: '', editable: true }
  const paste = env === 'browser'
    ? { text: 'X1234567', source: { role: 'textbox', name: sourceName } }
    : { fromOwner: false, source: { role: 'AXTextField', name: sourceName } }
  const r = policy.classify({ type: 'keypress', keys: [env === 'browser' ? 'META' : 'CMD', 'V'] }, { url: env === 'browser' ? 'https://other.example/form' : '', target, paste })
  return r.decision === 'allow' ? 'allow' : r.class
}
// [id, env, source field name, expected, status]
export const COPY_SOURCE_ROWS = [
  ['copy-source-browser-Passport', 'browser', 'Passport', 'sensitive_data', null],
  ['copy-source-desktop-IBAN', 'desktop', 'IBAN', 'sensitive_data', null],
  ['copy-source-desktop-Password', 'desktop', 'Password', 'credential', null],
  ['copy-source-browser-Notes', 'browser', 'Notes', 'allow', null],
]
for (const [id, env, source, expected, status] of COPY_SOURCE_ROWS) {
  const title = `${id} [paste from a named source into an unnamed entry, ${env}] -> ${expected}`
  if (status?.startsWith('todo ')) test(title, { todo: status }, () => assert.equal(decideCopySource(env, source), expected))
  else test(title, () => assert.equal(decideCopySource(env, source), expected))
}
test('copy-source rows: every todo row still fails (a fixed row cannot stay todo)', () => {
  for (const r of COPY_SOURCE_ROWS) if (r[4] !== null) assert.notEqual(decideCopySource(r[1], r[2]), r[3], `${r[0]} passes on main - close it`)
})

// CU-267 (cu-researcher): a value typed in pieces is judged action by action, so no value rule sees it whole. These
// rows run through the real loop (the desktop-consent harness: CU Fixture approved, its Notes text area focused) and
// read the first action that is not allowed. [id, pieces, expected, status, live]
const harness = await import('../../_verifiers_/desktop-consent/harness.mjs')
const notesArea = { bundleId: harness.FIXTURE, pid: 900, role: 'AXTextArea', title: 'Notes', frame: { x: 100, y: 200, width: 400, height: 200 } }
// The fake helper reads the focus from the world (world.focused); desktopRun takes no focus of its own. With noFocus the
// helper answers no focused element, as it does when an app's focus cannot be read.
async function decideSequence(actions, { noFocus = false } = {}) {
  const world = { ...harness.twoApps('com.example.other', [{ rect: notesArea.frame, element: notesArea }]), ...(noFocus ? {} : { focused: notesArea }) }
  const run = await harness.desktopRun({ world, turns: [{ actions }, { final: 'done' }], bounds: { maxSteps: 4 } })
  const asked = run.events.find((e) => e.kind === 'action' && e.decision !== 'allow')
  return asked ? asked.class : 'allow'
}
const cardDigits = CARD.replace(/\D/g, '')
const SEQUENCE_ROWS = [
  ['sequence-card as keypresses', [...cardDigits].map((d) => ({ type: 'keypress', keys: [d] })), 'sensitive_data', 'todo CU-267', 'no live row yet'],
  ['sequence-SSN as keypresses', [...SSN].map((c) => ({ type: 'keypress', keys: [c === '-' ? 'MINUS' : c] })), 'sensitive_data', 'todo CU-267', 'no live row yet'],
  ['sequence-card as four type actions', cardDigits.match(/\d{4}/g).map((g) => ({ type: 'type', text: g })), 'sensitive_data', 'todo CU-267', 'no live row yet'],
  // A no-input action between the pieces must not reset what the fix keeps (cu-researcher's correction on CU-267).
  ['sequence-card with waits between pieces', cardDigits.match(/\d{4}/g).flatMap((g) => [{ type: 'type', text: g }, { type: 'wait', duration_ms: 100 }]), 'sensitive_data', 'todo CU-267', 'no live row yet'],
  ['sequence-card with a screenshot between pieces', cardDigits.match(/\d{4}/g).flatMap((g) => [{ type: 'type', text: g }, { type: 'screenshot' }]), 'sensitive_data', 'todo CU-267', 'no live row yet'],
  ['sequence-card with a click into the same field between pieces', cardDigits.match(/\d{4}/g).flatMap((g) => [{ type: 'type', text: g }, { type: 'click', button: 'left', x: 200, y: 300 }]), 'sensitive_data', 'todo CU-267', 'no live row yet'],
  // With the focus unreadable the fix has no field to key the buffer by; the app (reset on any pointer action) would do.
  ['sequence-card as four type actions, focus unreadable', { noFocus: true, actions: cardDigits.match(/\d{4}/g).map((g) => ({ type: 'type', text: g })) }, 'sensitive_data', 'todo CU-267', 'no live row yet'],
  ['sequence-plain words in pieces (negative)', [{ type: 'type', text: 'abc' }, { type: 'type', text: 'def' }], 'allow', 'open CU-267', 'no live row yet'],
]
for (const [id, pieces, expected, status, live] of SEQUENCE_ROWS) {
  const title = `${id} -> ${expected} (live: ${live})`
  const opts = { skip: harness.ready ? false : 'the desktop-consent harness is not built here', ...(status?.startsWith('todo ') ? { todo: status } : {}) }
  test(title, opts, async () => assert.equal(await decideSequence(pieces.actions ?? pieces, { noFocus: pieces.noFocus === true }), expected))
}
test('sequence rows: named once; every open row names its issue; a todo row still fails (a fixed row cannot stay todo)', { skip: harness.ready ? false : 'harness not built' }, async () => {
  assert.equal(new Set(SEQUENCE_ROWS.map((r) => r[0])).size, SEQUENCE_ROWS.length)
  for (const [id, pieces, expected, status] of SEQUENCE_ROWS) {
    assert.match(status, /^(todo|open) CU-\d+$/, id)
    if (status.startsWith('todo ')) assert.notEqual(await decideSequence(pieces.actions ?? pieces, { noFocus: pieces.noFocus === true }), expected, `${id} passes on main - flip it from todo`)
  }
})

// CU-185: a phone number in national format (a trunk 0, no country code) typed into a neutral entry. Todo until the
// fix; a bare digit run and a 0-prefixed short code stay allowed by design.
// [id, text, expected, status]
export const NATIONAL_PHONE_ROWS = [
  ['phone-uk-landline', '020 7946 0958', 'sensitive_data', null, "main ee2138e37, browser, typed into an unnamed entry, cu-verifier: asked sensitive_data, nothing typed (20261108T014525Z-4f19d0)"],
  ['phone-uk-mobile', '07700 900123', 'sensitive_data', null, "main ee2138e37, real Chrome, unattended, typed into an unnamed entry, cu-verifier: asked sensitive_data, nothing typed (20261108T021255Z-91ba46)"],
  ['phone-fr', '01 23 45 67 89', 'sensitive_data', null, "main ee2138e37, real Chrome, unattended, typed into an unnamed entry, cu-verifier: asked sensitive_data, nothing typed (20261108T021259Z-eefba7)"],
  ['phone-de', '030 1234567', 'sensitive_data', null, "main ee2138e37, real Chrome, unattended, typed into an unnamed entry, cu-verifier: asked sensitive_data, nothing typed (20261108T021303Z-6adb1e)"],
  ['phone-de-parenthesised', '(030) 1234567', 'sensitive_data', null, "main ee2138e37, browser, typed into an unnamed entry, cu-verifier: asked sensitive_data (20261108T014529Z-1fb218)"],
  ['phone-bare-digits', '5559307784', 'allow', null, 'D-061: a bare run of digits is an id as often as a phone (value rules)'],
  ['phone-unbroken-national', '07700900123', 'allow', null, "the named limit - main ee2138e37, browser, typed into an unnamed entry, cu-verifier: allowed (20261108T014537Z-6550b0)"],
  ['phone-short-code', '0123 45', 'allow', null, 'D-061: too few digits for a phone (value rules)'],
  ['phone-date-time-dot', '07.11.2026 10:30', 'allow', null, "main ee2138e37, browser, typed into an unnamed entry, cu-verifier: allowed (20261108T014533Z-660366)"],
  ['phone-date-time-dash', '01-02-2026 09:15', 'allow', null, 'D-061: the date guard of #527, pinned by its mutant (value rules)'],
]
for (const [id, text, expected, status, live] of NATIONAL_PHONE_ROWS) {
  const title = `${id} [contact, value] -> ${expected} (live: ${live})`
  if (status?.startsWith('todo ')) test(title, { todo: status }, () => assert.equal(decide(text, 'Notes'), expected))
  else test(title, () => assert.equal(decide(text, 'Notes'), expected))
}
test('national phone rows: every todo row still fails; a closed row names a run or a decision (D-064)', () => {
  assert.equal(new Set(NATIONAL_PHONE_ROWS.map((r) => r[0])).size, NATIONAL_PHONE_ROWS.length)
  for (const r of NATIONAL_PHONE_ROWS) if (r[3] !== null) assert.match(r[3], /^(todo|open) CU-\d+$/)
  for (const r of NATIONAL_PHONE_ROWS) if (r[3]?.startsWith('todo ')) assert.notEqual(decide(r[1], 'Notes'), r[2], `${r[0]} passes on main - close it`)
  for (const r of NATIONAL_PHONE_ROWS) if (r[3] === null) assert.ok(closingRun(r[4]), `${r[0]} is closed without a run id or a D-number`)
})

for (const [id, group, kind, text, name, expected, status, live] of ROWS) {
  const title = `${id} [${group}, ${kind}] -> ${expected} (live: ${live})`
  if (status?.startsWith('todo ')) test(title, { todo: status }, () => assert.equal(decide(text, name), expected))
  else test(title, () => assert.equal(decide(text, name), expected))
}

test('every row is named once; every open row names its issue and still fails (a fixed row cannot stay todo)', () => {
  assert.equal(new Set(ROWS.map((r) => r[0])).size, ROWS.length)
  for (const r of ROWS) if (r[6] !== null) {
    assert.match(r[6], /^(todo|open) CU-\d+$/)
    if (r[6].startsWith('todo ')) assert.notEqual(decide(r[3], r[4]), r[5], `${r[0]} passes on main - close it`)
  }
  // A closed row names what ran live (or a decision); 'no live row' or 'pending' belongs to an open row.
  for (const r of ROWS) if (r[6] === null) assert.doesNotMatch(String(r[7]), /no live row|pending/i, `${r[0]} is closed without a live row - mark it open`)
})

test('negatives: a word inside another word, and a button, never ask by name', () => {
  for (const name of ['Pan size', 'Panel', 'Member since', 'Classname']) assert.equal(decide('abc123xyz', name), 'allow', name)
  const r = policy.classify({ type: 'click', x: 1, y: 1 }, { url: 'https://other.example/form', target: { role: 'button', name: 'Passport photo', editable: false } })
  assert.equal(r.decision, 'allow')
})

// CU-179: a paste takes the same name rules as typing. A browser paste carries the run's own clipboard text
// (paste.text); a desktop paste of the run's own copy carries no text, so the field's name is the only signal.
const decidePaste = (env, name) => {
  const r = env === 'browser'
    ? policy.classify({ type: 'keypress', keys: ['META', 'V'] }, { url: 'https://other.example/form', target: { role: 'textbox', name, editable: true }, paste: { text: 'abc123xyz' } })
    : policy.classify({ type: 'keypress', keys: ['CMD', 'V'] }, { url: '', target: { role: 'AXTextField', name, editable: true }, paste: { fromOwner: false } })
  return r.decision === 'allow' ? 'allow' : r.class
}

// [id, env, field name, expected, status, live]
export const PASTE_ROWS = [
  ['paste-browser-IBAN', 'browser', 'IBAN', 'sensitive_data', null, "main c69f5f665 (#431): copy from Notes, paste - asked, page got only Notes (173034Z-a5eac7, cu-verifier)"],
  ['paste-browser-Password', 'browser', 'Password', 'credential', null, "main c69f5f665 (#431): copy from Notes, paste - asked, page got only Notes (173020Z-e4cc0f, cu-verifier)"],
  ['paste-browser-Recovery phrase', 'browser', 'Recovery phrase', 'sensitive_data', null, "main c69f5f665 (#431): copy from Notes, paste - asked, page got only Notes (173025Z-2a1642, cu-verifier)"],
  ['paste-browser-Passport', 'browser', 'Passport', 'sensitive_data', null, "main c69f5f665 (#431): copy from Notes, paste - asked, page got only Notes (173029Z-06913e, cu-verifier)"],
  ['paste-browser-Notes', 'browser', 'Notes', 'allow', null, "main 93db0d51a, real Chrome, unattended, a page with entries labelled exactly so, cu-verifier: own copy from Tin can pasted into Notes, allowed, 11 chars (20261108T032446Z-2c7546); developer note: cu-developer-two's run 210028Z-1678b4"],
  ['paste-desktop-IBAN', 'desktop', 'IBAN', 'sensitive_data', null, "main a5ef4d2f5, helper 0.2.44, copyRow, one run: own copy from the unnamed entry, Command-V into IBAN asked sensitive_data, IBAN unchanged (20261107T214202Z-4f5659)"],
  ['paste-desktop-Password', 'desktop', 'Password', 'credential', null, "helper 0.2.44, consent-cells' plain Password: own copy pasted - app-policy HANDED OFF (password_field, CU-184; stricter than classify's credential), declined unattended (20261107T213600Z-8d8f59)"],
  ['paste-desktop-Tax ID', 'desktop', 'Tax ID', 'sensitive_data', null, "main 43f27d865, helper 0.2.44, CU Fixture long-form, one run: own copy typed into Contact, Command-C, click Tax ID, Command-V asked sensitive_data, Tax ID empty (20261107T214826Z-2af3fb)"],
  ['paste-desktop-Notes', 'desktop', 'Notes', 'allow', null, "negative: helper 0.2.44, copyRow: own copy pasted into the unnamed paste target (a neutral field, as Notes) - allowed, 5 chars arrived (20261107T213555Z-37b8cc)"],
]

for (const [id, env, name, expected, status, live] of PASTE_ROWS) {
  const title = `${id} [paste, ${env}] -> ${expected} (live: ${live})`
  if (status?.startsWith('todo ')) test(title, { todo: status }, () => assert.equal(decidePaste(env, name), expected))
  else test(title, () => assert.equal(decidePaste(env, name), expected))
}

test('paste rows: named once; every todo row still fails (a fixed row cannot stay todo)', () => {
  assert.equal(new Set(PASTE_ROWS.map((r) => r[0])).size, PASTE_ROWS.length)
  for (const r of PASTE_ROWS) if (r[4] !== null) {
    assert.match(r[4], /^(todo|open) CU-\d+$/)
    if (r[4].startsWith('todo ')) assert.notEqual(decidePaste(r[1], r[2]), r[3], `${r[0]} passes on main - close it`)
  }
})

// CU-178: spellings and abbreviations of names D-061 and D-062 already decided, typed unasked on main (cu-verifier's
// and cu-developer-one's sweeps). Each is a typed name row, todo until the fix.
// [id, field name, expected, status, live]
export const SPELLING_ROWS = [
  ["spelling-Driver's licence", "Driver's licence", 'sensitive_data', null, "main (#429): sensitive_data, declined, page got nothing (20261107T172937Z-2739e3, cu-verifier)"],
  ['spelling-Drivers licence', 'Drivers licence', 'sensitive_data', null, "main (#429): sensitive_data, declined, page got nothing (172942Z-a2d1d7, cu-verifier)"],
  ['spelling-Birthdate', 'Birthdate', 'sensitive_data', null, "main (#429): sensitive_data, declined, page got nothing (171604Z-ed1283, cu-verifier)"],
  ['spelling-D.O.B.', 'D.O.B.', 'sensitive_data', null, "main (#429): sensitive_data, declined, page got nothing (171600Z-14a177, cu-verifier)"],
  ['spelling-Mobile', 'Mobile', 'sensitive_data', null, "main (#429): sensitive_data, declined, page got nothing (171644Z-c4aacf, cu-verifier)"],
  ['spelling-Tel', 'Tel', 'sensitive_data', null, "main (#429): sensitive_data, declined, page got nothing (171714Z-cc2050, cu-verifier)"],
  ['spelling-Cell number', 'Cell number', 'sensitive_data', null, "main (#429): sensitive_data, declined, page got nothing (172946Z-5a8352, cu-verifier)"],
  ['spelling-Card no.', 'Card no.', 'sensitive_data', null, "main (#429): sensitive_data, declined, page got nothing (172950Z-418b00, cu-verifier)"],
  ['spelling-Exp. date', 'Exp. date', 'sensitive_data', null, "main (#429): sensitive_data, declined, page got nothing (171608Z-210e6e, cu-verifier)"],
  ['spelling-Valid thru', 'Valid thru', 'sensitive_data', null, "main (#429): sensitive_data, declined, page got nothing (171612Z-6306d1, cu-verifier)"],
  ['spelling-OTP', 'OTP', 'sensitive_data', null, "main (#429): sensitive_data, declined, page got nothing (171616Z-9683b1, cu-verifier)"],
  ['spelling-Account #', 'Account #', 'sensitive_data', null, "main (#429): sensitive_data, declined, page got nothing (171624Z-0df9b5, cu-verifier)"],
  ['spelling-Sort-code', 'Sort-code', 'sensitive_data', null, "main (#429): sensitive_data, declined, page got nothing (171632Z-fe49df, cu-verifier)"],
  ['spelling-BSB', 'BSB', 'sensitive_data', null, "main (#429): sensitive_data, declined, page got nothing (171636Z-458732, cu-verifier)"],
  ['spelling-TIN', 'TIN', 'sensitive_data', null, "main (#429): sensitive_data, declined, page got nothing (171640Z-261b9e, cu-verifier)"],
  ['spelling-Tax identification number', 'Tax identification number', 'sensitive_data', null, "main (#429): sensitive_data, declined, page got nothing (172954Z-b12b9c, cu-verifier)"],
  ['spelling-Hotel', 'Hotel', 'allow', null, "negative: Tel only as a whole word - main 93db0d51a, real Chrome, unattended, a page with entries labelled exactly so, cu-verifier: typed into Hotel, allowed (20261108T032436Z-c8275e); developer note: cu-developer-two's run 210022Z-7e0f35"],
  ['spelling-Tin can', 'Tin can', 'allow', null, "negative: TIN only in capitals - main 93db0d51a, real Chrome, unattended, a page with entries labelled exactly so, cu-verifier: typed into Tin can, allowed (20261108T032442Z-8db539); developer note: cu-developer-two's run 210025Z-d28434"],
]

for (const [id, name, expected, status, live] of SPELLING_ROWS) {
  const title = `${id} [spelling, name] -> ${expected} (live: ${live})`
  if (status?.startsWith('todo ')) test(title, { todo: status }, () => assert.equal(decide('abc123xyz', name), expected))
  else test(title, () => assert.equal(decide('abc123xyz', name), expected))
}

test('spelling rows: named once; every todo row still fails (a fixed row cannot stay todo)', () => {
  assert.equal(new Set(SPELLING_ROWS.map((r) => r[0])).size, SPELLING_ROWS.length)
  for (const r of SPELLING_ROWS) if (r[3] !== null) {
    assert.match(r[3], /^(todo|open) CU-\d+$/)
    if (r[3].startsWith('todo ')) assert.notEqual(decide('abc123xyz', r[1]), r[2], `${r[0]} passes on main - close it`)
  }
  for (const r of SPELLING_ROWS) if (r[3] === null) assert.doesNotMatch(String(r[4]), /no live row|pending/i, `${r[0]} is closed without a live row - mark it open`)
})

// D-064: in this table a row is closed only with a live run id (or its HHMMSSZ-xxxxxx short form) or a D-number.
test('D-064: every closed row names a run id or a D-number', () => {
  for (const r of ROWS) if (r[6] === null) assert.ok(closingRun(r[7]), `${r[0]} is closed without a run id - mark it open`)
  for (const r of PASTE_ROWS) if (r[4] === null) assert.ok(closingRun(r[5]), `${r[0]} is closed without a run id - mark it open`)
  for (const r of SPELLING_ROWS) if (r[3] === null) assert.ok(closingRun(r[4]), `${r[0]} is closed without a run id - mark it open`)
})
