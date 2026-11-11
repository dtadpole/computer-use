import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy, NEVER_PRE_APPROVED } from '../../_tools_/agent-core/policy.mjs'

// CU-494 (High; cu-coordinator 10:51Z): a pre-approval never carries a ruled High row - credential is never pre-approved on the web, and
// the High submit rows carry a never-pre-approved marker; ordinary submits stay pre-approvable.
const URL = 'https://app.example/settings'
const decide = (policy, name) => policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } })
const granted = createPolicy({ sitePolicy: () => 'allow', preApprovals: [{ class: 'submit' }, { class: 'credential' }, { class: 'sensitive_data' }, { class: 'install' }] })

test('CU-494 (1): a credential grant never covers a press - the ruled credential rows ask under any grant', () => {
  assert.ok(!NEVER_PRE_APPROVED.includes('credential'), 'a typed caller secret stays pre-approvable (CU-302)')
  for (const name of ['Change direct deposit', 'Change IBAN', 'Show seed phrase', 'Create filter']) {
    const v = decide(granted, name)
    assert.equal(v.decision, 'confirm', name)
  }
})

test('CU-494 (2): the High submit rows ask under a submit grant', () => {
  for (const name of ['Change salary', 'Update compensation', 'Give raise', 'Resubscribe all', 'Send to all contacts', 'Blast', 'Message everyone']) {
    const v = decide(granted, name)
    assert.equal(v.decision, 'confirm', name)
  }
})

test('CU-494: ordinary submits stay pre-approvable', () => {
  for (const name of ['Report spam', 'Submit', 'Send message', 'Post comment']) {
    const plain = decide(createPolicy({ sitePolicy: () => 'allow' }), name)
    if (plain.decision !== 'confirm' || plain.class !== 'submit') continue
    assert.equal(decide(granted, name).decision, 'allow', name)
  }
})

test('CU-494 (1, 11:06Z): the grant is value-bound - only the caller secret placeholder typed into a secret field rides it', () => {
  const type = (text, name, inputType = 'password') => granted.classify({ type: 'type', text }, { url: URL, target: { tag: 'input', inputType, role: 'textbox', name, editable: true } }).decision
  assert.equal(type('{{secret:login_password}}', 'Password'), 'allow', 'the caller secret into a password field')
  assert.equal(type('hunter2', 'Password'), 'confirm', 'other text into a secret field asks')
  for (const name of ['IBAN', 'Routing number', 'Account number', 'SWIFT code', 'Card number', 'Wallet address', 'Forwarding address', 'Recovery email']) assert.equal(type('{{secret:x}}', name, 'text'), 'confirm', name)
})

test('CU-494 red-team: an attacker IBAN typed under a credential grant asks at the typing step', () => {
  const v = granted.classify({ type: 'type', text: 'DE89370400440532013000' }, { url: URL, target: { tag: 'input', inputType: 'text', role: 'textbox', name: 'IBAN', editable: true } })
  assert.equal(v.decision, 'confirm')
})

test('CU-494 (3): the High install rows never ride an install grant', () => {
  for (const name of ['Install now', 'Add to Chrome', 'Get extension', 'Install app']) {
    const v = decide(granted, name)
    if (v.class === 'install' || (v.classes ?? []).includes('install')) assert.equal(v.decision, 'confirm', name)
  }
})

test('#664 round 3 (cu-researcher 11:11Z): SWIFT and wallet-address typing ask credential, with or without a grant', () => {
  const plain = createPolicy({ sitePolicy: () => 'allow' })
  for (const policy of [plain, granted]) for (const name of ['SWIFT code', 'Wallet address', 'BIC']) {
    const v = policy.classify({ type: 'type', text: 'ABCDEF12' }, { url: URL, target: { tag: 'input', inputType: 'text', role: 'textbox', name, editable: true } })
    assert.equal(v.decision, 'confirm', name)
  }
})
