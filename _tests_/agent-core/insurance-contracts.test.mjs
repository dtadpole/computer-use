import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-435 (High): binding, buying or renewing a policy, widening coverage, lowering a deductible or accepting a quote spends
// money (purchase); cancelling a policy cancels the contract (delete); accepting a settlement or filing a claim binds the
// owner (submit). Grammar table rows (cu-coordinator 18:51Z). Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://insurer.example/policy/123'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Policy number', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-435: binding, buying, renewing, coverage, deductible and quote acts ask purchase; cancelling a policy asks delete; settlements and claims submit', () => {
  const rows = [['Bind policy', 'purchase'], ['Buy policy', 'purchase'], ['Renew policy', 'purchase'], ['Increase coverage', 'purchase'], ['Add coverage', 'purchase'],
    ['Lower deductible', 'purchase'], ['Accept quote', 'purchase'], ['Cancel policy', 'delete'], ['Accept settlement', 'submit'], ['File a claim', 'submit'],
    ['File the claim', 'submit'], ['Submit claim', 'submit']]
  for (const [name, cls] of rows) {
    assert.equal(click(name), cls, name)
    assert.equal(enter(name), cls, `Return: ${name}`)
    assert.equal(space(name), cls, `Space: ${name}`)
  }
})

test('CU-435: the insurance rows are grammar table rows (module level), with the window and articles folded', () => {
  for (const [name, cls] of [['Bind the policy', 'purchase'], ['Lower my deductible', 'purchase'], ['Cancel my policy', 'delete'], ['File a new claim', 'submit']]) assert.deepEqual(grammarClasses(name), [cls], name)
})

test('CU-435 negatives: lists, details, getting or comparing quotes, viewing a claim, claim status and a privacy policy stay free', () => {
  for (const name of ['Policies', 'Coverage details', 'Get a quote', 'Compare quotes', 'View claim', 'Claim status', 'Privacy policy', 'Renew policy settings']) assert.equal(click(name), 'allow', name)
})
