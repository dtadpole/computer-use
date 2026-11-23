import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-459 (High): filing a tax return or an extension by other verbs asks submit (the 'File return' family); a fee at the same
// click leads with purchase. Grammar table rows. Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://tax.example/return/2026'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Signature PIN', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-459: sign and file, e-file, transmitting or submitting a return and filing or requesting an extension ask submit', () => {
  for (const name of ['Sign and file', 'E-file', 'Transmit return', 'Submit return', 'File extension', 'Request extension', 'File amended return']) {
    assert.equal(click(name), 'submit', name)
    assert.equal(enter(name), 'submit', `Return: ${name}`)
    assert.equal(space(name), 'submit', `Space: ${name}`)
  }
  assert.equal(click('Pay and file'), 'purchase', 'a fee at the same click: purchase leads')
  for (const name of ['Transmit my return', 'Request an extension', 'E-file now']) assert.deepEqual(grammarClasses(name), ['submit'], `table row: ${name}`)
})

test('CU-459 negatives: reviewing, previewing, downloading and saving a draft stay free', () => {
  for (const name of ['Review return', 'Preview', 'Download PDF', 'Save draft', 'Extensions', 'Returns']) assert.equal(click(name), 'allow', name)
})
