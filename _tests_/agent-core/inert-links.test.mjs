import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-472 (High; cu-coordinator 01:36Z): a non-navigating link (the driver's target.inertLink) is grammar-eligible like a button, so the
// table rows rendered as commit anchors ask; a real-URL link stays navigation (named limit).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name, extra = {}) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://wallet.example/app', target: { role: 'link', name, ...extra } }); return v.decision === 'allow' ? 'allow' : v.class }
const button = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://wallet.example/app', target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-472: an inert link asks as the same name on a button does', () => {
  for (const name of ['Show seed phrase', 'Change direct deposit', 'Add phone key', 'Turn off spam filter', 'Lock rate']) {
    const want = button(name)
    assert.notEqual(want, 'allow', `${name} asks on a button`)
    assert.equal(click(name, { inertLink: true }), want, `inert link: ${name}`)
  }
})

test('CU-472: a real-URL link stays navigation (named limit); inert links with free names stay free', () => {
  assert.equal(click('Show seed phrase', { href: 'https://wallet.example/seed' }), 'allow', 'a real-URL link navigates')
  for (const name of ['Learn more', 'Wallet', 'Activity']) assert.equal(click(name, { inertLink: true }), 'allow', name)
})
