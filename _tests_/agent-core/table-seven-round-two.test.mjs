import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// #602 round 2 (cu-researcher 01:31Z): price labels and discount badges stay free; a symbol after a comma-decimal number asks; the
// CU-468 and CU-470 held-out escapes fold in with their family's class.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const at = (name, url, role = 'button') => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role, name } }); return v.decision === 'allow' ? 'allow' : v.class }
const sw = (name, checked) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://home.example/lock', target: { name, tag: 'input', inputType: 'checkbox', role: 'switch', checked } }); return v.decision === 'allow' ? 'allow' : v.class }

test('#602 round 2: price labels and badges free unless a commit verb leads; comma decimals with a trailing symbol ask', () => {
  const shop = 'https://shop.example/checkout'
  for (const name of ['Price: $35', 'Sale - $35 off', 'Was $50', 'Save $10', 'Regular price $40']) assert.equal(at(name, shop), 'allow', name)
  for (const name of ['Weiter f\u00fcr 4,99 \u20ac', 'Continue - 12.00 EUR', 'Buy now - save $10', 'Pay 1,000 \u20ac']) assert.equal(at(name, shop), 'purchase', name)
})

test('#602 round 2: the CU-468 and CU-470 held-out escapes ask with their family class; older classes named', () => {
  for (const name of ['Set system to Disarmed', 'Set mode to Off', 'Turn off Auto-Lock timer']) assert.equal(at(name, 'https://home.example/lock'), 'physical', name)
  assert.equal(sw('Alarm armed', true), 'physical', 'a name variant of the armed switch, on -> off')
  assert.equal(sw('Alarm armed', false), 'allow', 'off -> on')
  for (const name of ['Download eSIM QR code', 'Show eSIM QR code', 'Convert my SIM to eSIM', 'Transfer number to another phone', 'Change my SIM card', 'Move my line to a new phone']) {
    assert.equal(at(name, 'https://carrier.example/lines'), 'credential', name)
  }
  // Named (older purchase 'transfer' / 'swap' words; no reclass): 'Transfer my eSIM', 'Swap to a new SIM'.
  for (const name of ['Transfer my eSIM', 'Swap to a new SIM']) assert.equal(at(name, 'https://carrier.example/lines'), 'purchase', name)
})

test('#602 round 2 (cu-coordinator 01:36Z): EU amount forms ask; CU-456 concrete-domain safe senders ask, one sender stays free', () => {
  for (const name of ['4,99 EUR', '4,99 \u20ac', 'Weiter f\u00fcr 4,99 \u20ac']) assert.equal(at(name, 'https://shop.example/checkout'), 'purchase', name)
  for (const name of ['Add example.com to safe senders', 'Add @example.com to safe senders']) assert.equal(at(name, 'https://mail.example/settings'), 'permission', name)
  for (const name of ['Add to safe senders', 'Add alice@example.com to safe senders']) assert.equal(at(name, 'https://mail.example/settings'), 'allow', name)
})

test('#602 round 2 (cu-developer-three 01:39Z): desktop roles - a menu button asks, list rows take the commit-verb form, a pop-up stays out', () => {
  const desk = (name, role) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'app:com.example.store', target: { role, name } }); return v.decision === 'allow' ? 'allow' : v.class }
  assert.equal(desk('Buy for $4.99', 'AXMenuButton'), 'purchase')
  assert.equal(desk('Buy for $5', 'AXRow'), 'purchase')
  assert.equal(desk('Blue mug, $12.99', 'AXRow'), 'allow')
  // Named: a closed pop-up showing a priced choice only opens its menu; the chosen AXMenuItem asks.
  assert.equal(desk('Monthly - $4.99', 'AXPopUpButton'), 'allow')
  assert.equal(desk('Monthly - $4.99', 'AXMenuItem'), 'purchase')
})

test('#602 x #604: an inert link takes the button amount pattern with a generic or commit verb or a period; a product tile stays free', () => {
  const inert = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://shop.example/search', target: { role: 'link', name, inertLink: true } }); return v.decision === 'allow' ? 'allow' : v.class }
  assert.equal(inert('Buy for $5'), 'purchase')
  assert.equal(inert('Blue mug, $12.99'), 'allow')
  // cu-coordinator 02:35Z: a generic or commit verb, an amount with a period, or a bare amount takes the button pattern.
  for (const name of ['Continue for $9.99', 'Confirm $12.00', '$4.99/month', 'Yes, charge $25', '$9.99', 'Add for $5', 'Weiter f\u00fcr 4,99 \u20ac']) assert.equal(inert(name), 'purchase', name)
  for (const name of ['Wireless mouse $25', 'Price: $35', 'Under $25']) assert.equal(inert(name), 'allow', name)
  assert.equal(inert('Show seed phrase'), 'credential', 'the other table rows still judge an inert link like a button')
})
