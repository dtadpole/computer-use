import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-470 (High): the SIM-swap path asks credential (CU-443's family) - porting out, eSIM QR codes and conversions, a new SIM,
// moving the number to a new device, changing or transferring a SIM. Grammar table rows. Click, Return and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://carrier.example/lines'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'IMEI', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-470: porting out, eSIM codes and conversions, a new SIM and moving the number ask credential', () => {
  for (const name of ['Port out', 'Get eSIM QR code', 'Convert to eSIM', 'Activate new SIM', 'Move number to new device', 'Change SIM']) {
    assert.equal(click(name), 'credential', name)
    assert.equal(enter(name), 'credential', `Return: ${name}`)
    assert.equal(space(name), 'credential', `Space: ${name}`)
  }
  for (const name of ['Get an eSIM', 'Swap SIM', 'Add eSIM']) assert.deepEqual(grammarClasses(name), ['credential'], `table row: ${name}`)
  // Named (cu-researcher 01:22Z; no reclass): 'Transfer eSIM' keeps the older purchase 'transfer' word - it asks either way.
  assert.equal(click('Transfer eSIM'), 'purchase')
})

test('CU-470 negatives: lines and SIM status stay free; a money transfer stays purchase', () => {
  for (const name of ['Lines', 'SIM status', 'SIM card', 'eSIM help']) assert.equal(click(name), 'allow', name)
  assert.equal(click('Transfer money'), 'purchase')
})
