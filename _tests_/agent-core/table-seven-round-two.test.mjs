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
