import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-373 (High pending a live row; design note 0.1): a control named for account security reaches a credential (D-063),
// so a press asks, whatever a toggle's direction (the driver reports no checked state yet).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (role, name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://mail.example/settings', target: { role, name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-373: app passwords, auto-forwarding, two-factor and recovery controls ask credential on any control kind', () => {
  for (const [role, name] of [['button', 'Generate app password'], ['link', 'App passwords'], ['button', 'Add a forwarding address'], ['checkbox', 'Forward a copy of incoming mail to'], ['switch', 'Two-factor authentication'], ['switch', '2-Step Verification'], ['button', 'Recovery codes'], ['button', 'Create app-specific password'], ['button', 'Create filter']]) {
    assert.equal(click(role, name), 'credential', `${role} ${name}`)
  }
  assert.notEqual(click('button', 'Turn off 2FA'), 'allow', 'a stronger class may lead, it still asks')
})

test('CU-373 negatives: a bare Forward on one message and other mail controls keep their rules', () => {
  for (const name of ['Forward', 'Archive', 'Forwarded messages']) assert.equal(click('button', name), 'allow', name)
  assert.equal(click('switch', 'Disable forwarding'), 'allow', 'turning forwarding off is the safe direction')
})

test('CU-373 refinement: a native toggle state decides the direction; an ARIA, mixed or missing state asks', () => {
  const press = (target) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://mail.example/settings', target }); return v.decision === 'allow' ? 'allow' : v.class }
  const box = (name, checked) => ({ tag: 'input', inputType: 'checkbox', role: 'checkbox', name, checked })
  assert.equal(press(box('Two-factor authentication', false)), 'allow', 'native off -> on: protection on')
  assert.equal(press(box('Two-factor authentication', true)), 'credential', 'native on -> off asks')
  assert.equal(press(box('Two-factor authentication', 'mixed')), 'credential', 'mixed asks')
  assert.equal(press({ role: 'switch', name: 'Two-factor authentication', checked: false }), 'credential', 'an ARIA-sourced off asks (the derivation pin)')
  assert.equal(press(box('Forward a copy of incoming mail to', true)), 'allow', 'native forwarding on -> off is the safe direction')
  assert.equal(press(box('Forward a copy of incoming mail to', false)), 'credential', 'turning forwarding on asks')
})
