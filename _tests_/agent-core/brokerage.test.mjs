import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-483 (High; cu-coordinator 05:34Z): brokerage acts - orders and automatic trading ask purchase, margin and options trading ask
// permission; a bare 'Sell' asks purchase only on a trading URL (the whole http(s) URL, as #613). Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const TRADE = 'https://broker.example/trade/AAPL'
const at = (name, url = TRADE, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } })
  return v.decision === 'allow' ? 'allow' : v.class
}

test('CU-483: brokerage acts ask in their ruled class', () => {
  for (const [name, cls] of [['Sell short', 'purchase'], ['Liquidate', 'purchase'], ['Liquidate all', 'purchase'], ['Exercise option', 'purchase'], ['Auto-invest', 'purchase'],
    ['Rebalance portfolio', 'purchase'], ['Enable margin', 'permission'], ['Turn on margin', 'permission'], ['Enable options trading', 'permission']]) {
    assert.equal(at(name, 'https://broker.example/account'), cls, name)
    assert.equal(at(name, 'https://broker.example/account', true), cls, `Space: ${name}`)
  }
})

test('CU-483: a bare Sell asks purchase on a trading URL (path, query or hash), stays free elsewhere (named limit)', () => {
  for (const url of [TRADE, 'https://broker.example/orders/new', 'https://app.example/?view=trade', 'https://app.example/#/portfolio', 'https://brokerage.example.com/brokerage/x']) {
    assert.equal(at('Sell', url), 'purchase', url)
    assert.equal(at('Sell all', url), 'purchase', url)
  }
  for (const url of ['https://market.example/listings', 'https://app.example/trader-tips', 'https://app.example/?ordering=price', 'app:com.example.broker',
    'https://shop.example/trade-in/phone', 'https://ip.example/trademark/search', 'https://jobs.example/trades-people']) assert.equal(at('Sell', url), 'allow', url)
  assert.equal(at('Sell 10 shares', 'https://market.example/listings'), 'purchase', 'a quantity on the control (older)')
})

test('CU-483 negatives: quotes, positions and watchlists stay free', () => {
  for (const name of ['Quote', 'Positions', 'Watchlist', 'Portfolio', 'Orders']) assert.equal(at(name), 'allow', name)
})

test('#633 round 2 (cu-researcher 07:05Z): the held-out escapes fold', () => {
  for (const [name, cls] of [['Short sell', 'purchase'], ['Exercise contract', 'purchase'], ['Exercise options', 'purchase'], ['Turn on leverage', 'permission'], ['Enable options', 'permission'],
    ['Resubscribe everyone', 'submit'], ['Resubscribe entire list', 'submit'], ['Re-subscribe all', 'purchase'], ['Blast it', 'submit'], ['Blast now', 'submit']]) assert.equal(at(name, 'https://broker.example/account'), cls, name)
  for (const name of ['Options chain', 'Leverage FAQ', 'Short interest', 'Blast radius']) assert.equal(at(name, 'https://broker.example/account'), 'allow', name)
})
