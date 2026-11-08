import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createApprovalStore, createPolicy, looksSensitive, screenTask } from '../../_tools_/agent-core/policy.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { CARD, CARD_BAD_LUHN, SK_KEY, SSN } from '../fixture-shapes/shapes.mjs'

const URL_OK = 'http://127.0.0.1:43117/tasks/x/'
const sitePolicy = () => createSitePolicy({ startUrl: URL_OK })
const button = (name) => ({ tag: 'button', role: 'button', name, fingerprint: name })
const click = { type: 'click', button: 'left', x: 10, y: 10 }

test('each consequential class has an allowed and a confirmed case (R51)', () => {
  const policy = createPolicy({ sitePolicy: sitePolicy() })
  const cases = [
    ['purchase', 'Place order', 'Show details'],
    ['delete', 'Delete badge', 'Details'],
    ['permission', 'Share with team', 'Shared files list'],
    ['submit', 'Submit', 'Submitted items'],
  ]
  for (const [cls, risky, benign] of cases) {
    const confirm = policy.classify(click, { url: URL_OK, target: button(risky) })
    assert.deepEqual([confirm.decision, confirm.class], ['confirm', cls], risky)
    assert.equal(policy.classify(click, { url: URL_OK, target: button(benign) }).decision, 'allow', benign)
  }
  assert.equal(policy.classify(click, { url: URL_OK, target: button('Transfer $500') }).class, 'purchase', 'moving money confirms like a purchase')
  assert.equal(policy.classify(click, { url: URL_OK, target: button('Transfers history') }).decision, 'allow')
  const enter = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL_OK, target: button('Send message') })
  assert.equal(enter.class, 'submit')
})

test('typing: credentials, secrets and sensitive data confirm; ordinary text is allowed (R29)', () => {
  const policy = createPolicy({ sitePolicy: sitePolicy() })
  const field = (extra) => ({ tag: 'input', role: 'textbox', name: 'Field', fingerprint: 'f', ...extra })
  assert.equal(policy.classify({ type: 'type', text: 'hunter2' }, { url: URL_OK, target: field({ inputType: 'password' }) }).class, 'credential')
  assert.equal(policy.classify({ type: 'type', text: '123456' }, { url: URL_OK, target: field({ autocomplete: 'one-time-code' }) }).class, 'credential')
  assert.equal(policy.classify({ type: 'type', text: '{{secret:login}}' }, { url: URL_OK, target: field() }).class, 'credential')
  assert.equal(policy.classify({ type: 'type', text: CARD }, { url: URL_OK, target: field() }).class, 'sensitive_data')
  assert.equal(policy.classify({ type: 'type', text: 'Ada Lovelace' }, { url: URL_OK, target: field() }).decision, 'allow')
  assert.equal(looksSensitive('jane@example.com'), 'email')
  assert.equal(looksSensitive(SSN), 'national_id')
  assert.equal(looksSensitive('+1 (415) 555-0100'), 'phone')
  assert.equal(looksSensitive(SK_KEY), 'key')
  assert.equal(looksSensitive(`order ${CARD_BAD_LUHN}`), null, 'fails the Luhn check')
  assert.equal(looksSensitive('2026-11-01'), null)
  assert.equal(looksSensitive('2026-11-01 10:30'), null)
  assert.equal(looksSensitive('415-555-0100'), 'phone')
  assert.equal(looksSensitive('locker 482913'), null)
})

test('pre-approvals come from the caller; purchase, delete and permission always confirm', () => {
  const policy = createPolicy({
    sitePolicy: sitePolicy(),
    preApprovals: [{ class: 'submit', origin: 'http://localhost:43117' }, { class: 'purchase' }, { class: 'bogus' }],
  })
  assert.deepEqual(policy.preApprovals, [{ class: 'submit', origin: 'http://127.0.0.1:43117' }])
  assert.equal(policy.classify(click, { url: URL_OK, target: button('Submit') }).decision, 'allow')
  assert.equal(policy.classify(click, { url: URL_OK, target: button('Buy now') }).decision, 'confirm')
})

test('site filter: a refused page blocks, a new site confirms, a denied navigate blocks', () => {
  const policy = createPolicy({ sitePolicy: sitePolicy() })
  assert.equal(policy.classify(click, { url: 'http://localhost:8088/', target: button('x') }).decision, 'block')
  const navigate = policy.classify({ type: 'navigate', url: 'https://example.com/' }, { url: URL_OK })
  assert.deepEqual([navigate.decision, navigate.class], ['confirm', 'new_site'])
  assert.equal(policy.classify({ type: 'navigate', url: 'http://localhost:3080/' }, { url: URL_OK }).decision, 'block')
  assert.equal(policy.classify({ type: 'navigate', url: 'http://127.0.0.1:43117/other' }, { url: URL_OK }).decision, 'allow')
})

test('held dialogs: accepting is page_dialog, dismissing is allowed; interstitials and password changes hand off', () => {
  const policy = createPolicy({ sitePolicy: sitePolicy() })
  const dialog = { type: 'confirm', message: 'Delete this badge?' }
  const accept = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL_OK, target: null, dialog })
  assert.deepEqual([accept.decision, accept.class], ['confirm', 'delete'], 'the dialog message names delete, which ranks first')
  assert.deepEqual(accept.classes, ['delete', 'page_dialog'], 'every class that applied is listed')
  const plain = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL_OK, dialog: { type: 'confirm', message: 'Leave this page?' } })
  assert.equal(plain.class, 'page_dialog')
  assert.equal(policy.classify({ type: 'keypress', keys: ['ESCAPE'] }, { url: URL_OK, dialog }).decision, 'allow')
  assert.equal(policy.classify(click, { url: 'chrome-error://chromewebdata/', target: null }).decision, 'block', 'not on the allow list')
  const handoff = policy.classify(click, { url: URL_OK, target: button('Change password') })
  assert.equal(handoff.decision, 'handoff')
  assert.equal(policy.classify(click, { url: URL_OK, interstitial: true }).decision, 'handoff')
})

test('approval store: once is not kept, batch ends with the batch, run lasts', () => {
  const store = createApprovalStore()
  store.grant({ cls: 'submit', origin: 'o', lifetime: 'once' })
  assert.equal(store.covers('submit', 'o'), false)
  store.grant({ cls: 'submit', origin: 'o', lifetime: 'batch' })
  store.grant({ cls: 'credential', origin: 'o', lifetime: 'run' })
  assert.equal(store.covers('submit', 'o'), true)
  assert.equal(store.covers('submit', 'other'), false)
  store.endBatch()
  assert.equal(store.covers('submit', 'o'), false)
  assert.equal(store.covers('credential', 'o'), true)
})

test('task screening: each refused class has a refused and an allowed case (R56)', () => {
  const cases = [
    ['money_transfer', 'Wire $500 to account 1234 at my bank', 'Check the transfer status page and report it'],
    ['trading', 'Buy 10 shares of ACME at market price', 'Look up the share price of ACME'],
    ['medical_decision', 'Change my medication dosage in the portal', 'Find the pharmacy opening hours'],
    ['legal_decision', 'File the lawsuit against my landlord online', 'Find the court address'],
  ]
  for (const [cls, refused, allowed] of cases) {
    assert.deepEqual([screenTask(refused).refused, screenTask(refused).class], [true, cls], refused)
    assert.equal(screenTask(allowed).refused, false, allowed)
  }
  for (const benign of ['Create a visitor badge for Mira.', "Open 'Show pickup details' and report the locker and pickup code."]) {
    assert.equal(screenTask(benign).refused, false, benign)
  }
})

test('a reference to an existing order is not a purchase; the verb and other purchase words still confirm (CU-8)', () => {
  const policy = createPolicy({ sitePolicy: sitePolicy() })
  const cell = (name) => ({ role: 'AXCell', name, fingerprint: name })
  const dbl = { type: 'double_click', x: 10, y: 10 }
  for (const name of ['Order #4344', 'Order 4344', 'Order no. 4344', 'Order number 4344', 'Order details', 'Order history', 'Order status', 'Orders']) {
    assert.notEqual(policy.classify(dbl, { url: URL_OK, target: cell(name) }).class, 'purchase', name)
  }
  for (const name of ['Order', 'Order now', 'Place order', 'Order for $12', 'Order #4344 - Pay now', 'Buy order #12', 'Order 2 items', 'Order 3', 'Order 12 copies']) {
    assert.equal(policy.classify(click, { url: URL_OK, target: button(name) }).class, 'purchase', name)
  }
})

test('a sensitive-looking value the task itself names is not sensitive_data; one it does not name still asks (CU-8)', () => {
  const policy = createPolicy({ sitePolicy: sitePolicy() })
  const field = { role: 'AXTextField', name: '', fingerprint: 'to' }
  const typed = (text) => ({ type: 'type', text })
  const task = 'In CU Fixture, send a message to hr@example.com and call +1 555 123 4567 if needed.'
  const cls = (text) => policy.classify(typed(text), { url: URL_OK, target: field, task }).class
  assert.notEqual(cls('hr@example.com'), 'sensitive_data', 'the task named this address')
  assert.notEqual(cls('HR@example.com'), 'sensitive_data', 'case-insensitive')
  assert.notEqual(cls('+1 555 123 4567'), 'sensitive_data', 'the task named this number')
  assert.equal(cls('boss@corp.example'), 'sensitive_data', 'an address the task does not name')
  assert.equal(cls(`hr@example.com ${CARD}`), 'sensitive_data', 'a card next to the named address still asks')
  assert.equal(policy.classify(typed('hr@example.com'), { url: URL_OK, target: field }).class, 'sensitive_data', 'without a task nothing is exempt')
})

