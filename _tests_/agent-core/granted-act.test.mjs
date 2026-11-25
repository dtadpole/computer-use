import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-788 (P2 over-ask, split from CU-783; a narrowing under D-110): the phrase grammar read a guest or visitor as a physical
// object and as a grant whatever the act was, so 'Let any visitor choose a theme' asked physical + permission. Now the act
// granted to the people decides: a harmless act on their own view grants nothing, and a guest or visitor is a physical
// object only when the act lets them in (or no act follows). Both sides, click and Space, web and desktop frames.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const verdict = (v) => (v.decision === 'allow' ? 'allow' : (v.classes ?? [v.class]).join('+'))
const press = (url, target, extra = {}, action = { type: 'click', x: 1, y: 1, button: 'left' }) => verdict(policy.classify(action, { url, target, ...extra }))
const SETTINGS = 'com.example.siteadmin'
const sw = (name, checked = false) => press('https://social.example/settings', { role: 'switch', tag: 'button', name, checked })
const webcb = (name, checked = false) => press('https://social.example/settings', { role: 'checkbox', tag: 'input', inputType: 'checkbox', name, checked })
const space = (name) => press('https://social.example/settings', { role: 'switch', tag: 'button', name, checked: false }, {}, { type: 'keypress', keys: ['SPACE'] })
const axcb = (name) => press(`desktop://${SETTINGS}`, { role: 'AXCheckBox', name, checked: false, inWebArea: false, origin: SETTINGS }, { frontmostBundleId: SETTINGS })
const button = (name) => press('https://home.example/door', { role: 'button', tag: 'button', name })

test('CU-788: the filed rows - a harmless act granted to visitors is free; browsing the owner\'s albums asks permission only', () => {
  // cu-researcher's filed rows (CU-783's filing, verbatim; switch, off, clicked).
  assert.equal(sw('Let any visitor choose a theme'), 'allow')
  assert.equal(sw('Let any visitor browse my albums'), 'permission')
})

test('CU-788: the freed shapes - a harmless act on the people\'s own view grants nothing and opens no door', () => {
  for (const name of [
    'Let any visitor choose a theme', 'Allow any visitor to choose a theme', 'Let visitors pick a language', 'Let any member choose a theme',
    'Allow members to sort the list', 'Let guests switch to dark mode',
  ]) {
    assert.equal(sw(name), 'allow', name)
    assert.equal(webcb(name), 'allow', `checkbox: ${name}`)
    assert.equal(space(name), 'allow', `Space: ${name}`)
  }
  assert.equal(axcb('Let any visitor choose a theme'), 'allow')
})

test('CU-788: the near forms keep asking - letting someone in, guest access, and a real access act', () => {
  for (const name of ['Let the guest in', 'Let visitors through', 'Buzz in visitor', 'Let guests unlock the door', 'Allow visitors to come in']) {
    assert.match(button(name), /physical/, name)
  }
  assert.match(sw('Enable guest access'), /physical/) // CU-544 keeps its older physical
  assert.match(sw('Enable guest access'), /permission/)
  assert.match(sw('Allow guests to edit'), /permission/)
  assert.match(button('Let anyone join'), /permission/)
  assert.match(sw('Allow guests'), /physical/) // no act follows: unchanged
})

test('CU-788: a harmless verb that hands over control still asks permission - the act\'s object decides (cu-developer-two)', () => {
  for (const name of [
    'Let guests customize permissions', 'Allow everyone to select the owner', 'Allow members to pick an admin', 'Let guests choose who can edit',
    'Let visitors choose their role', 'Allow guests to select who has access',
  ]) {
    assert.match(sw(name), /permission/, name)
    assert.match(webcb(name), /permission/, `checkbox: ${name}`)
    assert.match(axcb(name), /permission/, `desktop: ${name}`)
  }
})
