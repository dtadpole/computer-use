import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'

import { BIP39_ENGLISH_LIST } from '../../_tools_/agent-core/bip39-english.mjs'
import { createPolicy, looksSensitive } from '../../_tools_/agent-core/policy.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { SEED_TWELVE, j } from '../fixture-shapes/shapes.mjs'

// CU-164 (cu-researcher's red team of CU-163): a 0x private key, a recovery phrase, and text in fields named for a
// password, a recovery phrase, a private key, a one-time code or an identity document were typed with no class.

const START = 'https://wallet.example/restore'
const policy = createPolicy({ sitePolicy: createSitePolicy({ startUrl: START }) })
const judge = (target, text) => policy.classify({ type: 'type', text }, { url: START, task: 'restore the wallet', target: { origin: 'https://wallet.example', fingerprint: 'f', ...target } })
const web = (name, extra = {}) => ({ tag: 'input', role: 'textbox', name, editable: true, inputType: 'text', ...extra })
const desk = (name, role = 'AXTextField') => ({ role, name })
const ask = (v) => [v.decision, v.class]
const TWELVE = SEED_TWELVE
// TWELVE and the list's next twelve words, six to a line, so no source line holds a whole recovery phrase.
const TWENTY_FOUR = [TWELVE, 'account accuse achieve acid acoustic acquire',
  'across act action actor actress actual'].join(' ')

test('the BIP39 list is the canonical one: 2048 words whose SHA-256 is the spec\'s', () => {
  assert.equal(BIP39_ENGLISH_LIST.length, 2048)
  assert.equal(createHash('sha256').update(BIP39_ENGLISH_LIST.join('\n') + '\n').digest('hex'),
    j('2f5eed53a4727b4bf8880d8f3f199efc', '90e58503646d9ff8eff3a2ed3b24dbda'))
})

test('a 0x + 64-hex private key is sensitive data; a 0x + 40-hex wallet address is not (it is public)', () => {
  const key = '0x' + 'a3f1'.repeat(16)
  assert.equal(looksSensitive(key), 'key')
  assert.deepEqual(ask(judge(web('Notes'), key)), ['confirm', 'sensitive_data'])
  assert.equal(looksSensitive('0x' + 'b2'.repeat(20)), null, 'an address')
})

test('twelve or twenty-four recovery words in a row are sensitive data, alone or inside a sentence; prose and eleven words are not', () => {
  for (const phrase of [TWELVE, TWENTY_FOUR, `my words are: ${TWELVE}.`, TWELVE.toUpperCase().replace(/ /g, '\n')]) {
    assert.equal(looksSensitive(phrase), 'recovery_phrase', phrase.slice(0, 30))
  }
  assert.deepEqual(ask(judge(web('Notes'), TWENTY_FOUR)), ['confirm', 'sensitive_data'])
  assert.equal(looksSensitive('please meet me at the station after work so we can talk about it'), null, 'prose')
  assert.equal(looksSensitive(TWELVE.split(' ').slice(0, 11).join(' ')), null, 'eleven words')
})

test('a text entry named for a password asks credential, whatever its type says (a show-password toggle)', () => {
  for (const name of ['Password', 'Confirm password', 'Passcode', 'Passphrase', 'PIN', 'Enter your PIN code']) {
    assert.deepEqual(ask(judge(web(name), 'hunter2')), ['confirm', 'credential'], name)
  }
  assert.deepEqual(ask(judge(desk('Password'), 'hunter2')), ['confirm', 'credential'], 'a desktop text field')
})

test('a text entry named for a recovery phrase, a private key, a one-time code or an identity document asks sensitive_data', () => {
  for (const name of ['Recovery phrase', 'Seed phrase', 'Secret recovery phrase', 'Mnemonic', 'Private key', 'Secret key',
    'One-time code', 'Verification code', 'Passport number', 'National Insurance number', 'NI number', 'Date of birth', 'DOB']) {
    assert.deepEqual(ask(judge(web(name), 'abc 123')), ['confirm', 'sensitive_data'], name)
    assert.deepEqual(ask(judge(desk(name, 'AXTextArea'), 'abc 123')), ['confirm', 'sensitive_data'], `${name} (desktop)`)
  }
})

test('the name rules need a text entry: a button named Pin, a checkbox, an editable-false element do not ask', () => {
  assert.notEqual(judge({ tag: 'button', role: 'button', name: 'Pin to top', editable: false }, 'x').class, 'credential')
  assert.equal(judge({ role: 'AXButton', name: 'Password settings' }, 'x').decision, 'allow')
  assert.equal(judge({ role: 'textbox', name: 'Password', editable: false }, 'x').decision, 'allow', 'an ARIA textbox the driver reports not editable')
  assert.equal(judge(web('Order notes'), 'leave it at the door please').decision, 'allow')
})

test('CU-167: a social security number, a CVV, a bare Passport, a driving licence, a birthday and a security question ask by name', () => {
  for (const name of ['SSN', 'Social security number', 'CVV', 'CVC', 'CVV2', 'Passport', 'Passport no.', "Driver's license", 'Driver’s license number',
    'Drivers license', 'Driving licence', 'Birthday', "Mother's maiden name", 'Mother’s maiden name', 'Security question', 'Security answer',
    'CSC', 'National ID', 'Social insurance number', 'Tax file number']) {
    assert.deepEqual(ask(judge(web(name), '123456789')), ['confirm', 'sensitive_data'], name)
    assert.deepEqual(ask(judge(desk(name), '123456789')), ['confirm', 'sensitive_data'], `${name} (desktop)`)
  }
})

test('CU-167 negatives: no text entry, or a name that only contains the letters, does not ask', () => {
  assert.equal(judge({ tag: 'input', role: 'button', name: 'Upload passport photo', editable: false }, 'x').decision, 'allow', 'a button, not a text entry')
  for (const name of ['Classname', 'Mission statement', 'Cvvx code', 'Driver name']) assert.equal(judge(web(name), 'hello').decision, 'allow', name)
  assert.equal(judge(web('ID number'), 'A-1042').decision, 'allow', "'ID number' alone stays allowed (order and member ids - cu-researcher)")
})


test('CU-172: acronyms match case-sensitively as whole tokens; spelled-out names in any case', () => {
  for (const name of ['SIN', 'TFN', 'PAN number', 'NHS number', 'MRN', 'SOCIAL INSURANCE NUMBER', 'national identity number']) {
    assert.deepEqual(ask(judge(web(name), 'abc123xyz')), ['confirm', 'sensitive_data'], name)
  }
  for (const name of ['Sin City', 'Pan size', 'Panel', 'Nhs-free notes', 'Spinal']) assert.equal(judge(web(name), 'hello').decision, 'allow', name)
})

test('CU-172: a UK NI number and an Indian PAN by value - upper case, valid letters only', () => {
  for (const text of ['AB 12 34 56 C', 'AB123456C', 'ABCPE1234F']) assert.equal(looksSensitive(text), 'national_id', text)
  for (const text of ['ab 12 34 56 c', 'GB 12 34 56 C', 'DA 12 34 56 C', 'AB 12 34 56 E', 'ABCDE1234F', 'abcpe1234f']) {
    assert.equal(looksSensitive(text), null, text)
  }
})

test('CU-172: an Aadhaar (Verhoeff) and a TFN (mod 11) by value - canonical spacing only, never inside a longer run of groups', () => {
  assert.equal(looksSensitive('2345 6789 0127'), 'national_id')
  assert.equal(looksSensitive('TFN 123 456 782'), 'tax_id')
  for (const text of ['2345 6789 0123', '234567890127', '2345-6789-0127', '1345 6789 0127', '2345 6789 0127 5556', '9 2345 6789 0127',
    '123 456 789', '123456782', '123 456 782 999', '61 123 456 782']) {
    assert.equal(looksSensitive(text), null, text)
  }
  assert.equal(looksSensitive('2345 6789 0127 5555'), 'card', 'a Luhn-valid 16-digit run still asks - as a card')
})

test('D-062: e-mail, phone and street-level address fields ask by name; a city, postcode, ZIP, IP or web address does not', () => {
  for (const name of ['Email', 'E-mail address', 'Phone', 'Mobile number', 'Telephone', 'Street', 'Street address', 'Address line 1',
    'Home address', 'Shipping address', 'Billing address', 'Mailing address', 'Postal address']) {
    assert.deepEqual(ask(judge(web(name), 'abc123xyz')), ['confirm', 'sensitive_data'], name)
  }
  for (const name of ['City', 'Postcode', 'ZIP code', 'Postal code', 'IP address', 'Web address', 'Address book name']) {
    assert.equal(judge(web(name), 'abc123xyz').decision, 'allow', name)
  }
})

test('CU-178: spellings and abbreviations of decided names ask - British licence, birthdate, D.O.B., expiry and OTP forms, card and account marks', () => {
  for (const name of ["Driver's licence", 'Driver’s licence number', 'Drivers licence', 'Driver licence', 'DL number', 'Licence number', 'License number',
    'Birthdate', 'Birth day', 'D.O.B.', 'Exp. date', 'Exp date', 'Expiration', 'Valid thru', 'Valid through', 'OTP', 'Card no.', 'Card #', 'Cell number',
    'Mobile', 'Tel', 'Tel.', 'Account #', 'Acct #', 'Acct number', 'BSB', 'Tax identification number', 'Tax no.', 'TIN', 'CPF', 'NRIC', 'Sort-code']) {
    assert.deepEqual(ask(judge(web(name), 'abc123xyz')), ['confirm', 'sensitive_data'], name)
  }
})

test('CU-178: a curly apostrophe is read as a straight one - Driver\u2019s licence asks by that alone (cu-verifier)', () => {
  assert.deepEqual(ask(judge(web('Driver\u2019s licence'), 'abc123xyz')), ['confirm', 'sensitive_data'])
})

test('CU-178: Mobile alone asks, so a text entry like Mobile app name asks too - the over-ask the table owner accepted', () => {
  assert.deepEqual(ask(judge(web('Mobile app name'), 'my app')), ['confirm', 'sensitive_data'])
})

test('CU-178: a name matches literally and whole - a dot is not a wildcard, an acronym keeps its case, a hyphen counts as a space', () => {
  for (const name of ['DxOxB', 'Tin can', 'Hotel name', 'Expert notes', 'Cardholder notes', 'Telescope']) assert.equal(judge(web(name), 'hello').decision, 'allow', name)
  // The table owner's scope: no decided class behind these, too broad alone.
  for (const name of ['Driver ID', 'ID number', 'House number', 'Insurance number']) assert.equal(judge(web(name), 'hello').decision, 'allow', name)
  assert.deepEqual(ask(judge(web('sort-code'), 'abc')), ['confirm', 'sensitive_data'], 'hyphen as a space')
})
