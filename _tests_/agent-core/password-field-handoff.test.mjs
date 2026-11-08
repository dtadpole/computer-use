import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'

// CU-184 (desktop-rules.md): a desktop text entry named for a password hands off like its secure twin (R83).
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-pw-field-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const policy = createAppPolicy({ scope: [FIXTURE], approvals: store, preApprovals: [{ class: 'credential' }, { class: 'sensitive_data' }] })
const field = (name) => ({ origin: FIXTURE, role: 'AXTextField', name, editable: true, fingerprint: name })
const judge = (action, name) => { const v = policy.classify(action, { frontmostBundleId: FIXTURE, target: field(name) }); return [v.decision, v.decision === 'handoff' ? v.rule : v.class] }
const TYPE = { type: 'type', text: 'hunter2' }

test('CU-184: typing or pasting into a shown password field hands off, even with a credential pre-approval', () => {
  for (const name of ['Password', 'Passcode', 'Passphrase', 'PIN', 'PIN code', 'New password']) {
    assert.deepEqual(judge(TYPE, name), ['handoff', 'password_field'], name)
  }
  assert.deepEqual(judge({ type: 'keypress', keys: ['CMD', 'V'] }, 'Password'), ['handoff', 'password_field'], 'a paste is a key action')
})

test('CU-184: a hint is not the secret, a click only focuses, other names are untouched', () => {
  assert.equal(judge(TYPE, 'Password hint')[0], 'confirm', 'a hint asks credential, it is not handed off')
  assert.equal(judge(TYPE, 'Password hint')[1], 'credential')
  assert.equal(judge({ type: 'click', button: 'left', x: 10, y: 10 }, 'Password')[0], 'allow', 'clicking into the field is not typing')
  assert.notEqual(judge(TYPE, 'Passport')[0], 'handoff', 'a passport is not a password')
  assert.equal(judge(TYPE, 'Notes')[0], 'allow')
})

test('CU-184: the browser is unchanged - a password field asks credential', () => {
  const web = createPolicy({ sitePolicy: createSitePolicy({ startUrl: 'https://form.example/x' }) })
  const v = web.classify(TYPE, { url: 'https://form.example/x', task: 't', target: { tag: 'input', role: 'textbox', name: 'Password', editable: true, origin: 'https://form.example', fingerprint: 'p' } })
  assert.deepEqual([v.decision, v.class], ['confirm', 'credential'])
})
