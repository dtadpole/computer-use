import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-336 (design note 0.2 on the issue; cu-coordinator 10:16Z: Medium, sensitive_data): inside a cross-origin frame whose
// names are unread, a short card code - 3 or 4 digits, or an expiry - asks sensitive_data, on both frame paths.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const PAGE = 'https://shop.example/checkout'
const verdict = (action, target, extra = {}) => {
  const r = policy.classify(action, { url: PAGE, target, ...extra })
  return r.decision === 'allow' ? 'allow' : r.class
}
const type = (text) => ({ type: 'type', text })
const key = (ch) => ({ type: 'keypress', keys: [ch] })
// The iframe itself as the target: the driver did not follow the focus (decideFrame's shape).
const frame = (name, extra = {}) => ({ tag: 'iframe', role: 'Iframe', name, editable: false, ...extra })
// An inner field the driver followed into (CU-300): its own name, its frame's origin and the host as frameHost.
const inner = (name, hostName, origin = 'https://js.payments.example') => ({ tag: 'input', inputType: 'text', role: 'textbox', name, editable: true, origin, frameHost: { tag: 'iframe', role: 'Iframe', name: hostName } })

test('CU-336: a CVV or expiry typed into an unnamed cross-origin frame asks - both paths, whitespace removed', () => {
  for (const text of ['123', '1234', '12/29', '12/2029', '01-27', '12.27', ' 1 2 3 ', '12 / 27']) {
    assert.equal(verdict(type(text), frame(null)), 'sensitive_data', `iframe target: ${JSON.stringify(text)}`)
    assert.equal(verdict(type(text), inner(null, null)), 'sensitive_data', `inner field: ${JSON.stringify(text)}`)
  }
  assert.equal(verdict(type('123'), inner(null, null, undefined)), 'sensitive_data', 'an unread frame origin counts as cross-origin (fail closed)')
})

test('CU-336: a code pressed key by key asks at the key that completes it (the typed buffer)', () => {
  assert.equal(verdict(key('1'), frame(null), { typed: { before: '', next: '1' } }), 'allow')
  assert.equal(verdict(key('2'), frame(null), { typed: { before: '1', next: '2' } }), 'allow')
  assert.equal(verdict(key('3'), frame(null), { typed: { before: '12', next: '3' } }), 'sensitive_data')
  assert.equal(verdict(type('9'), inner(null, null), { typed: { before: '12/2', next: '9' } }), 'sensitive_data')
})

test('CU-336 negatives: named frames, same-origin frames, other lengths and free text stay as judged', () => {
  assert.equal(verdict(type('123'), frame('Comments')), 'allow', 'a named non-payment frame is judged by its name')
  assert.equal(verdict(type('123'), inner('Quantity', null)), 'allow', 'a named inner field is judged by its name')
  assert.equal(verdict(type('123'), inner(null, 'Chat widget')), 'allow', 'a named frame host is judged by its name')
  assert.equal(verdict(type('123'), frame(null, { frameUrl: 'https://shop.example/embedded' })), 'allow', 'a same-origin frame')
  assert.equal(verdict(type('123'), inner(null, null, 'https://shop.example')), 'allow', 'a same-origin inner field')
  assert.equal(verdict(type('123'), { ...inner(null, null, undefined), frameUrl: 'https://shop.example/pay' }), 'allow', 'a same-origin frameUrl on the inner field (#181) is read first')
  assert.equal(verdict(type('123'), { ...inner(null, null, undefined), frameUrl: 'https://js.payments.example/pay' }), 'sensitive_data', 'a cross-origin frameUrl on the inner field asks')
  for (const text of ['12', '12345', '123456', 'hello there', '13/29', '12/295']) {
    assert.equal(verdict(type(text), frame(null)), 'allow', JSON.stringify(text))
  }
})

test('CU-336: named payment frames keep their stronger rules (CU-297, CU-300)', () => {
  assert.equal(verdict(type('123'), frame('Secure Credit Card Frame - CVV')), 'sensitive_data')
  assert.equal(verdict(type('123'), inner(null, 'Secure Credit Card Frame - CVV')), 'sensitive_data')
})
