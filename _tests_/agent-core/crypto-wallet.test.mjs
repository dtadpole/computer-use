import assert from 'node:assert/strict'
import { test } from 'node:test'

import { grammarClasses } from '../../_tools_/agent-core/phrase-grammar.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-452 (High): wallet secrets (seed phrase, private key, import / restore) ask credential; token approvals, transactions,
// swaps and bridges purchase; connecting a wallet permission; an airdrop claim submit. Grammar table
// rows. Click, Return and Space (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://wallet.example/app'
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Search tokens', defaultButtonRead: true, defaultButton: { role: 'button', name } } }); return v.decision === 'allow' ? 'allow' : v.class }
const space = (name) => { const v = policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-452: wallet secrets credential, approvals and transactions purchase, connect and message signatures permission, airdrops submit', () => {
  const rows = [['Show seed phrase', 'credential'], ['Reveal recovery phrase', 'credential'], ['Show private key', 'credential'], ['Export private key', 'credential'],
    ['Import wallet', 'credential'], ['Restore wallet', 'credential'], ['Set approval for all', 'purchase'], ['Approve spending', 'purchase'], ['Approve unlimited', 'purchase'],
    ['Sign transaction', 'purchase'], ['Confirm swap', 'purchase'], ['Bridge', 'purchase'], ['Connect wallet', 'permission'], ['Claim airdrop', 'submit']]
  for (const [name, cls] of rows) {
    assert.equal(click(name), cls, name)
    assert.equal(enter(name), cls, `Return: ${name}`)
    assert.equal(space(name), cls, `Space: ${name}`)
  }
  // cu-coordinator 22:30Z / 22:31Z: a bare 'Mint', 'Sign message' and 'Sign this message' stay PURCHASE - the older words and the
  // grammar's own row agree; no reclass (they ask either way).
  for (const name of ['Mint', 'Sign message', 'Sign this message']) assert.equal(click(name), 'purchase', `${name}: purchase stays`)
  for (const [name, cls] of [['Reveal the secret phrase', 'credential'], ['Connect your wallet', 'permission'], ['Approve token', 'purchase']]) assert.deepEqual(grammarClasses(name), [cls], `table row: ${name}`)
})

test('CU-452 negatives: wallet, assets, activity, receive and disconnect stay free; Revoke approval keeps an older ask', () => {
  for (const name of ['Wallet', 'Assets', 'Activity', 'Receive', 'Disconnect']) assert.equal(click(name), 'allow', name)
  // Named over-ask (older 'revoke' permission word; CU-429's family).
  assert.equal(click('Revoke approval'), 'permission', 'older rule')
})
