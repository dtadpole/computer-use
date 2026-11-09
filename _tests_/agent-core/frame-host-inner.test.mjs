import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-300 (frame-focus.md 0.2, the policy half - never weaker than CU-297's frame-host rules): once the browser driver
// follows the focus into a cross-origin frame, the target is the inner field, with its host as frameHost { tag, role,
// name }. The host's name is judged beside the field's own for every text route, and a Return there asks submit unless
// the frame's own default button was read (defaultButtonRead true).

const policy = createPolicy({ sitePolicy: () => 'allow' })
const WEB = 'https://shop.example/checkout'
const key = (...keys) => ({ type: 'keypress', keys })
const type = (text) => ({ type: 'type', text })
const judge = (action, target, extra = {}, url = WEB) => {
  const v = policy.classify(action, { url, target, ...extra })
  return v.decision === 'allow' ? 'allow' : v.class
}
const host = (name) => ({ tag: 'iframe', role: 'Iframe', name })
const inner = (name, hostName, extra = {}) => ({ tag: 'input', inputType: 'text', role: 'textbox', name, editable: true, origin: 'https://js.payments.example', frameHost: host(hostName), defaultButtonRead: true, defaultButton: null, ...extra })

test('CU-300: an unnamed inner field is judged by its frame host\'s name - typed, pressed or pasted', () => {
  const cvv = inner('', 'Secure Credit Card Frame - CVV')
  assert.equal(judge(type('123'), cvv), 'sensitive_data', 'typed')
  assert.equal(judge(key('1'), cvv), 'sensitive_data', 'a printable key (CU-301)')
  assert.equal(judge(key('META', 'V'), cvv, { paste: { fromOwner: false, text: '' } }), 'sensitive_data', 'a keystroke paste')
  const pasteItem = { role: 'menuitem', name: 'Paste' }
  assert.equal(judge({ type: 'click', x: 1, y: 1, button: 'left' }, pasteItem, { paste: { fromOwner: false, text: '', destination: cvv } }), 'sensitive_data', 'a menu paste into it')
  assert.equal(judge(type('correct-horse'), inner('', 'Password')), 'credential', 'a framed password')
})

test('CU-300: the field\'s own name decides by itself - the host never weakens it; two neutral names stay free', () => {
  assert.equal(judge(type('4'), inner('Card number', 'Comments')), 'sensitive_data', 'a card-number field in a comments-titled frame')
  assert.equal(judge(type('hello there'), inner('Order notes', 'Comments')), 'allow', 'both neutral')
  assert.equal(judge(type('hello'), { ...inner('Message', 'Comments'), frameHost: null }), 'allow', 'no frameHost: the field alone')
})

test('CU-300: a Return in an inner field asks submit unless the frame\'s own default button was read', () => {
  assert.equal(judge(key('ENTER'), inner('Email', 'Sign in', { defaultButtonRead: false })), 'submit', 'the read failed')
  const { defaultButtonRead, ...unread } = inner('Email', 'Sign in')
  assert.equal(defaultButtonRead, true)
  assert.equal(judge(key('ENTER'), unread), 'submit', 'no read state at all')
  assert.equal(judge(type('refund policy\n'), inner('Search', 'Help', { defaultButtonRead: false })), 'submit', 'a typed line break, read failed')
  assert.equal(judge(key('ENTER'), inner('Search', 'Help')), 'allow', 'read, and there is none')
  assert.equal(judge(key('ENTER'), inner('Search', 'Help', { defaultButton: { role: 'button', name: 'Pay now', panel: null } })), 'purchase', 'read: the frame\'s Pay now is judged')
  // A second-level host - an iframe inside the frame (a 3-D Secure challenge) - is a frame host itself: CU-297's rule.
  assert.equal(judge(key('ENTER'), { ...host('3-D Secure challenge'), editable: false, frameHost: host('Secure payment frame') }), 'submit', 'the nested host')
})

test('CU-300: the desktop and a held dialog are unchanged', () => {
  assert.equal(judge(type('123'), { role: 'AXTextField', name: '', editable: true, frameHost: host('CVV') }, {}, 'desktop://'), 'allow', 'the desktop reports no frame host')
  const held = policy.classify(key('ENTER'), { url: WEB, target: null, dialog: { type: 'confirm', message: 'Leave this page?' } })
  assert.deepEqual(held.classes, ['page_dialog'])
})
