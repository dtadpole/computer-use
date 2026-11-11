import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-451 (High, one ruling): a rate lock, pre-approval, Easy Apply, a tour request or contacting an agent asks submit (CU-415
// booking and CU-422 application families). Grammar table rows. Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://homes.example/listing/9'
const click = (name, url = URL) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'ZIP code', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-451: rate locks, pre-approval, Easy Apply, tours and contacting an agent ask submit', () => {
  for (const name of ['Lock rate', 'Lock my rate', 'Get pre-approved', 'Start pre-approval', 'Easy Apply', 'Schedule tour', 'Request a tour', 'Contact agent', 'Message agent']) {
    assert.equal(click(name), 'submit', name)
    assert.equal(enter(name), 'submit', `Return: ${name}`)
    assert.equal(space(name), 'submit', `Space: ${name}`)
  }
  assert.equal(click('Apply now', 'https://jobs.example/role/42'), 'submit', 'Apply now on a job page')
  for (const name of ['Lock in this rate', 'Get pre-qualified', 'Book a showing', 'Email the landlord']) assert.deepEqual(grammarClasses(name), ['submit'], `table row: ${name}`)
})

test('CU-451 negatives: rates, the calculator, saving a home or job and viewing details stay free; Share listing keeps an older ask', () => {
  for (const name of ['Rates', 'Mortgage calculator', 'Save home', 'Save job', 'View details', 'Tours', 'Agents']) assert.equal(click(name), 'allow', name)
  // Named over-ask (older 'share' permission word; CU-429's family): 'Share listing' copies a link.
  assert.equal(click('Share listing'), 'permission', 'older rule')
})
