import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-409 (High): leverage, positions, lending, liquidity, listings, offers and token-spend approvals move money (purchase).
// Bare Long/Short/Borrow/Lend/Supply/Repay only in asset context. Click and Return (D-106). Both sides (D-099).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://exchange.example/trade'
const click = (name, formContext) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { tag: 'button', role: 'button', name, ...(formContext ? { formContext } : {}) } }); return v.decision === 'allow' ? 'allow' : v.class }
const enter = (name, formContext) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: URL, target: { tag: 'input', role: 'textbox', name: 'Amount', defaultButtonRead: true, defaultButton: { role: 'button', name, ...(formContext ? { formContext } : {}) } } }); return v.decision === 'allow' ? 'allow' : v.class }

test('CU-409: positions, leverage, liquidity, listings, offers and spend approvals ask purchase anywhere, click and Return', () => {
  for (const name of ['Open position', 'Close position', 'Leverage 10x', 'Leverage 2.5x', '10x leverage', 'Add liquidity', 'Remove liquidity', 'List for sale', 'Make offer', 'Make an offer', 'Accept offer', 'Set spending cap', 'Approve USDC', 'Approve WETH', 'Increase allowance', 'Approve spending']) {
    assert.equal(click(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
  }
})

test('CU-409: bare Long / Short / Borrow / Lend / Supply / Repay ask purchase in asset context', () => {
  for (const name of ['Long', 'Short', 'Borrow', 'Lend', 'Supply', 'Repay']) {
    assert.equal(click(name, { options: ['BTC'], amountEntry: true }), 'purchase', `${name} beside BTC`)
    assert.equal(enter(name, { options: ['ETH'], amountEntry: true }), 'purchase', `Return: ${name} beside ETH`)
  }
  for (const name of ['Long BTC', 'Short ETH', 'Borrow USDC', 'Lend $500', 'Supply DAI', 'Repay 100 USDC']) assert.equal(click(name), 'purchase', name)
})

test('CU-409 negatives: lists, labels and a bare verb with no asset context stay free', () => {
  for (const name of ['Positions', 'Markets', 'Leverage', 'Borrow rates', 'Liquidity pools', 'Offers', 'Long', 'Short', 'Borrow', 'Borrow 2 books']) assert.equal(click(name), 'allow', name)
  for (const name of ['Approve', 'Approve changes']) assert.equal(click(name), 'submit', `${name} keeps its submit (not a token approval)`)
})

test('CU-409 near forms (10:19Z): Open long/short, Close all positions, Market close, List NFT/item, Repay loan, lowercase known-token approvals ask purchase', () => {
  for (const name of ['Open long', 'Open short', 'Close all positions', 'Market close', 'List NFT', 'List item', 'Repay loan', 'Approve usdc', 'approve weth', 'Approve Matic']) {
    assert.equal(click(name), 'purchase', name)
    assert.equal(enter(name), 'purchase', `Return: ${name}`)
  }
  for (const name of ['Approve post', 'Approve request', 'Approve changes']) assert.notEqual(click(name), 'purchase', `${name} stays as it is`)
})
