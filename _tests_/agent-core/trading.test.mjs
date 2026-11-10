import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-400 (High): trades, swaps, stakes and signatures on an exchange move money irreversibly - they ask purchase. Both sides.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const click = (name) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://exchange.example/trade', target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-400: confirm/sign transaction, sign message, swap, stake, trade, place order, sell now and confirm swap/trade/sale ask purchase', () => {
  for (const name of ['Confirm transaction', 'Sign transaction', 'Sign message', 'Swap', 'Stake', 'Trade', 'Place order', 'Sell now', 'Confirm swap', 'Confirm trade', 'Confirm sale', 'Bridge', 'Bridge tokens']) assert.equal(click(name), 'purchase', name)
})

test('CU-400: Sell, Convert and Deposit beside an asset or an amount ask purchase', () => {
  for (const name of ['Sell BTC', 'Convert 0.5 ETH', 'Deposit USD', 'Sell $100', 'Convert to USDC', 'Deposit crypto']) assert.equal(click(name), 'purchase', name)
})

test('CU-400 negatives: a marketplace Sell, a file Convert and a bare Deposit stay free', () => {
  for (const name of ['Sell', 'Sell an item', 'Convert', 'Convert to PDF', 'Deposit']) assert.equal(click(name), 'allow', name)
})
