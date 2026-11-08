import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { HELPER_VERSION_FLOOR, helloProblem, versionAtLeast } from '../../_environments_/macos-desktop/helper-link.mjs'

// D-069 (keyboard-activation.md, CU-190): fail closed on the default button's read state. On the desktop a Return with
// no default name asks submit unless the helper read "none" (true); a helper too old to send the field is refused at the
// handshake. The browser has no read state, so its Return keeps the focused-name rule.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const RETURN = { type: 'type', text: 'x\n' } // a typed newline in a single-line input presses the default button
const FIELD = { role: 'AXTextField', name: 'Message' }
const verdict = (url, target) => { const r = policy.classify(RETURN, { url, target }); return r.decision === 'allow' ? 'allow' : r.class }

test('D-069: a desktop Return asks submit when the default button read failed or was never sent; a read of none keeps the rule', () => {
  assert.equal(verdict('app:ai.reflection.cu.fixture', { ...FIELD, defaultButtonRead: false }), 'submit', 'a failed read (CU-190)')
  assert.equal(verdict('app:ai.reflection.cu.fixture', FIELD), 'submit', 'no read state at all (D-069)')
  assert.equal(verdict('app:ai.reflection.cu.fixture', { ...FIELD, defaultButtonRead: null }), 'submit', 'a null read state')
  assert.equal(verdict('app:ai.reflection.cu.fixture', { ...FIELD, defaultButtonRead: true }), 'allow', 'read: there is none')
})

test('D-069 guard: no target on the desktop is the driver\'s good read of nothing focused and no default button - it keeps the rule', () => {
  // environment.mjs returns null exactly then (cu-verifier); a live focused target always carries the read field.
  assert.equal(verdict('app:ai.reflection.cu.fixture', null), 'allow')
})

test('D-069 guard: a browser Return without any read state keeps the focused-name rule - no over-ask on every page', () => {
  assert.equal(verdict('https://other.example/form', { role: 'textbox', name: 'Message', editable: true }), 'allow')
})

test('D-069: the helper link refuses a helper before 0.2.44, compared part by part', () => {
  assert.equal(HELPER_VERSION_FLOOR, '0.2.44')
  for (const [version, ok] of [['0.2.43', false], ['0.2.44', true], ['0.2.49', true], ['0.2.100', true], ['0.3.0', true], ['0.1.99', false], ['0.2', false], ['0.2.x', false]]) {
    assert.equal(versionAtLeast(version, HELPER_VERSION_FLOOR), ok, version)
  }
  const hello = (helperVersion) => ({ type: 'hello', token: 't', protocol: 1, helperVersion, grants: { screen: true, accessibility: true }, displays: [] })
  assert.match(String(helloProblem(hello('0.2.43'), 't')), /older than 0\.2\.44.*D-069/)
})
