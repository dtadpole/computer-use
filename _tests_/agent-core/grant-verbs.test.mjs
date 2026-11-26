import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-830 (P2 under-ask, found in CU-824 test1): grant verbs the grammar did not read - 'Permit visitors to control the heating'
// went free while 'Let / Allow visitors ...' asks. cu-researcher's marker table r2 (OK 26 Nov 09:15Z): permit, authorize /
// authorise, empower and entitle read as 'allow' with a people slot, enable only as 'enable <people> to <act>', permit also with an
// access object; a past state, a noun, 'enable <feature>' and 'invite' keep main's verdict. Parity rows: each verb gives exactly the
// verdict the 'Allow' form gives, on a web switch, a web button and a desktop check box.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const verdict = (v) => (v.decision === 'allow' ? 'allow' : (v.classes ?? [v.class]).join('+'))
const press = (url, target, extra = {}) => verdict(policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target, ...extra }))
const HOME = 'com.example.homehub'
const sw = (name) => press('https://home.example/settings', { role: 'switch', tag: 'button', name, checked: false })
const button = (name) => press('https://home.example/settings', { role: 'button', tag: 'button', name })
const axcb = (name) => press(`desktop://${HOME}`, { role: 'AXCheckBox', name, checked: false, inWebArea: false, origin: HOME }, { frontmostBundleId: HOME })
const ROUTES = { sw, button, axcb }

// Shapes whose 'Allow' / 'Let' form asks on main (CU-824's device grant; the exposure rows of the visibility suites).
const SHAPES = ['%s visitors to control the thermostat', '%s guests to control the lights', '%s non-friends to see my posts',
  '%s guests to see my profile', '%s search engines to index my profile']
const FOLDED = ['Permit', 'Authorize', 'Authorise', 'Empower', 'Entitle']

test('CU-830: the filed row asks like its Allow form', () => {
  for (const [route, f] of Object.entries(ROUTES)) {
    assert.notEqual(f('Permit visitors to control the heating'), 'allow', route)
    assert.equal(f('Permit visitors to control the heating'), f('Allow visitors to control the heating'), route)
  }
})

test('CU-830: permit / authorize / authorise / empower / entitle over a people slot ask exactly as allow does', () => {
  for (const shape of SHAPES) {
    for (const [route, f] of Object.entries(ROUTES)) {
      const base = f(shape.replace('%s', 'Allow'))
      assert.notEqual(base, 'allow', `the Allow form asks on main: ${shape} (${route})`)
      for (const verb of FOLDED) assert.equal(f(shape.replace('%s', verb)), base, `${verb}: ${shape} (${route})`)
    }
  }
})

test("CU-830: enable folds only as 'enable <people> to <act>'", () => {
  for (const shape of SHAPES) {
    for (const [route, f] of Object.entries(ROUTES)) assert.equal(f(shape.replace('%s', 'Enable')), f(shape.replace('%s', 'Allow')), `Enable: ${shape} (${route})`)
  }
  // 'enable <feature>' with no people word stays free.
  for (const f of Object.values(ROUTES)) assert.equal(f('Enable dark mode'), 'allow')
})

test('CU-830: nouns and past states stay free - one past-event row per added verb', () => {
  for (const name of ['Parking permit', 'Permit number', 'Permitted visitors', 'Authorized visitors', 'Empowered teams', 'Entitled members', 'Enabled features']) {
    for (const [route, f] of Object.entries(ROUTES)) assert.equal(f(name), 'allow', `${name} (${route})`)
  }
})
