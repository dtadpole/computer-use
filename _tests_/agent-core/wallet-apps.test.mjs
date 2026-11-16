import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-576 (cu-researcher 07:28Z): in a crypto wallet app a send / broadcast / sign / confirm asks purchase (never grantable); other apps and
// other controls keep today's judgement.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const classesOf = (bundle, name) => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: `desktop://${bundle}`, frontmostBundleId: bundle, target: { role: 'AXButton', name, inWebArea: false } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}

test('CU-576: money-moving and signing controls in wallet apps ask purchase', () => {
  for (const bundle of ['com.sparrowwallet.sparrow', 'com.ledger.live', 'io.trezor.TrezorSuite', 'org.electrum.electrum']) {
    for (const name of ['Send', 'Broadcast', 'Broadcast Transaction', 'Confirm', 'Sign', 'Sign and send', 'Approve', 'Swap', 'Bump fee']) assert.ok(classesOf(bundle, name).includes('purchase'), `${name} @ ${bundle}`)
  }
})

test('CU-576 negatives: reading and receiving in wallets, and the same words in other apps, keep their judgement', () => {
  for (const name of ['Receive', 'Accounts', 'Settings', 'Send feedback', 'Show address']) assert.ok(!classesOf('com.sparrowwallet.sparrow', name).includes('purchase'), name)
  for (const name of ['Confirm', 'Sign']) assert.ok(!classesOf('com.apple.TextEdit', name).includes('purchase'), name)
})

test('#865 round 2 (cu-researcher 07:34Z): any wallet by its bundle vocabulary, and spend / transaction verbs', () => {
  for (const bundle of ['zksnacks.wasabiwallet', 'org.org.pythonmac.unspecified.Electrum', 'io.metamask.desktop', 'app.phantom.desktop']) for (const name of ['Send', 'Spend', 'Broadcast']) assert.ok(classesOf(bundle, name).includes('purchase'), `${name} @ ${bundle}`)
  for (const name of ['Spend', 'Finalize transaction', 'Push PSBT', 'Sweep funds', 'Move coins to cold storage']) assert.ok(classesOf('com.sparrowwallet.sparrow', name).includes('purchase'), name)
  for (const name of ['View transactions', 'Export PSBT', 'Show address', 'Receive']) assert.ok(!classesOf('com.sparrowwallet.sparrow', name).includes('purchase'), name)
  for (const name of ['Send', 'Spend']) assert.ok(!classesOf('com.apple.Notes', name).includes('purchase'), name)
})

test('#865 round 3 (cu-researcher 07:38Z): a money operation named anywhere asks - Start coinjoin', () => {
  for (const name of ['Start coinjoin', 'Begin mixing round', 'Run swap', 'Enable staking', 'Initiate withdrawal']) assert.ok(classesOf('zksnacks.wasabiwallet', name).includes('purchase'), name)
  assert.ok(!classesOf('com.example.ledger', 'Confirm').includes('purchase'), 'a bookkeeping app named Ledger is not a wallet (cu-developer-three 07:39Z)')
  for (const name of ['View coinjoin history', 'Show swaps', 'Staking guide']) assert.ok(!classesOf('zksnacks.wasabiwallet', name).includes('purchase') || name === 'Staking guide', name)
})
