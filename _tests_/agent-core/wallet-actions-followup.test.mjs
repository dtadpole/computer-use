import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-709 (cu-researcher's D-112 follow-up to CU-576): lend / borrow / repay / burn / supply and opening or closing a payment channel
// ask purchase in a wallet app and on a web wallet or DeFi page; elsewhere, and with a navigation noun, they keep today's judgement.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const desktop = (bundle, name) => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: `desktop://${bundle}`, frontmostBundleId: bundle, target: { role: 'AXButton', name, inWebArea: false } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}
const web = (url, name) => {
  const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { tag: 'button', role: 'button', name } })
  return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
}
const ROWS = ['Lend', 'Borrow', 'Repay', 'Burn', 'Supply', 'Open channel', 'Close channel', 'Force close channel', 'Open a Lightning channel']

test('CU-709: the follow-up verbs ask purchase in wallet apps', () => {
  for (const bundle of ['com.sparrowwallet.sparrow', 'com.ledger.live', 'org.electrum.electrum']) {
    for (const name of ROWS) assert.ok(desktop(bundle, name).includes('purchase'), `${name} @ ${bundle}`)
  }
})

test('CU-709: and on a web wallet or DeFi page (host or wallet path)', () => {
  for (const url of ['https://app.aave.com/markets', 'https://app.compound.finance/', 'https://example.org/wallet', 'https://bank.example/defi/positions', 'https://exchange.example/lending/usdc']) {
    for (const name of ROWS) assert.ok(web(url, name).includes('purchase'), `${name} @ ${url}`)
  }
})

test('CU-709 near collisions: other apps and pages, and navigation nouns, keep their judgement', () => {
  for (const name of ['Burn', 'Close channel', 'Lend', 'Borrow']) {
    assert.ok(!desktop('com.apple.TextEdit', name).includes('purchase'), `${name} in TextEdit`)
    assert.ok(!desktop('com.tinyspeck.slackmacgap', name).includes('purchase'), `${name} in Slack`)
  }
  for (const [url, name] of [['https://library.example/catalog', 'Borrow'], ['https://www.youtube.com/channels', 'Close channel'], ['https://cdburner.example/', 'Burn'], ['https://blog.example/how-to-lend', 'Lend']]) {
    assert.ok(!web(url, name).includes('purchase'), `${name} @ ${url}`)
  }
  for (const name of ['Borrow rates', 'Lending history', 'Channel settings', 'Supply APY', 'Repay details']) {
    assert.ok(!desktop('com.sparrowwallet.sparrow', name).includes('purchase'), `${name} in a wallet`)
    assert.ok(!web('https://app.aave.com/markets', name).includes('purchase'), `${name} on a DeFi page`)
  }
})
