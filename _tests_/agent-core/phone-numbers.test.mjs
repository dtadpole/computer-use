import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-443 (High): porting a number out, forwarding calls or texts (credential - an account-takeover path like mail forwarding),
// releasing a number (delete), placing a call (submit) and recording one (permission). Grammar table rows. Click, Return,
// Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://phone.example/calls'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Search contacts', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-443: port-out and forwarding ask credential, releasing a number deletes, calls submit, recording asks permission', () => {
  const rows = [['Port number', 'credential'], ['Port my number', 'credential'], ['Get port-out PIN', 'credential'], ['Forward calls', 'credential'],
    ['Turn on call forwarding', 'credential'], ['Forward texts', 'credential'], ['Release number', 'delete'], ['Cancel number', 'delete'], ['Call now', 'submit'],
    ['Call this number', 'submit'], ['Call Alice', 'submit'], ['Record call', 'permission']]
  for (const [name, cls] of rows) {
    assert.equal(click(name), cls, name)
    assert.equal(enter(name), cls, `Return: ${name}`)
    assert.equal(space(name), cls, `Space: ${name}`)
  }
  // Named: 'Transfer number' keeps the older 'transfer' purchase ask, which leads by precedence (it asks either way).
  assert.equal(click('Transfer number'), 'purchase', 'older class leads')
  for (const [name, cls] of [['Port my phone number', 'credential'], ['Release this line', 'delete'], ['Call the office', 'submit']]) assert.deepEqual(grammarClasses(name), [cls], `table row: ${name}`)
})

test('CU-443 negatives: numbers, call history, voicemail, turning forwarding off and the dial pad stay free; #462 keeps its own', () => {
  for (const name of ['Numbers', 'Call history', 'Voicemail', 'Turn off call forwarding', 'Dial pad', 'Call log', 'Call settings', 'Call waiting', 'Call Stack', 'Call tree']) assert.equal(click(name), 'allow', name)
  assert.deepEqual(grammarClasses('Call back'), [], 'with #462')
})
