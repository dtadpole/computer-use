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

test('CU-709: and on a web wallet or DeFi page (its registered domain or a wallet / defi path)', () => {
  for (const url of ['https://app.aave.com/markets', 'https://app.compound.finance/', 'https://example.org/wallet', 'https://bank.example/defi/positions', 'https://app.spark.fi/borrow', 'https://v2.app.aave.com/']) {
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

test('CU-709 fold (cu-developer-one, cu-verifier on #1521): loans, look-alike hosts and links stay free; a rate in an action does not free it', () => {
  const link = (url, name) => {
    const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { tag: 'a', role: 'link', name } })
    return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
  }
  const axLink = (bundle, name) => {
    const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: `desktop://${bundle}`, frontmostBundleId: bundle, target: { role: 'AXLink', name, inWebArea: false } })
    return v.decision === 'allow' ? [] : (v.classes ?? [v.class])
  }
  // a /lending or /borrowing path alone is any loan; a bare service label on another domain is not the service
  for (const [url, name] of [['https://catalog.library.example.edu/borrowing/item/123', 'Borrow'], ['https://tools.example.org/lending/drill-42', 'Lend'],
    ['https://spark.example.org/inbox', 'Supply'], ['https://curve.example.com/', 'Supply'], ['https://orca.example.net/tickets', 'Burn'],
    ['https://notaave.com/', 'Borrow'], ['https://aave.com.example.org/', 'Borrow']]) {
    assert.ok(!web(url, name).includes('purchase'), `${name} @ ${url}`)
  }
  // a rate later in the action's name does not free it; a navigation noun right after the verb does
  for (const name of ['Supply ETH (3.2% APY)', 'Borrow USDC at 5.1% APR', 'Repay the loan details later']) {
    assert.ok(web('https://app.aave.com/', name).includes('purchase'), `${name} on Aave`)
  }
  for (const name of ['Open channel settings', 'Borrow the rates', 'Supply my APY']) {
    assert.ok(!web('https://app.aave.com/', name).includes('purchase'), `${name} on Aave`)
  }
  // a link opens a page
  assert.ok(!link('https://app.aave.com/', 'Borrow').includes('purchase'), 'link Borrow on Aave')
  assert.ok(!axLink('com.ledger.live', 'Lend').includes('purchase'), 'AXLink Lend in Ledger Live')
})
