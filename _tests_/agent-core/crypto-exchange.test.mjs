import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createPolicy } from '../../_tools_/agent-core/policy.mjs'

// CU-500 (High; cu-coordinator 12:49Z): crypto exchange rows as verb families with object synonyms. Click and Space (D-106).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const URL = 'https://exchange.example/wallet'
const at = (name, key = false) => {
  const v = key ? policy.classify({ type: 'keypress', keys: ['SPACE'] }, { url: URL, target: { tag: 'button', role: 'button', name } }) : policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: URL, target: { role: 'button', name } })
  return v.decision === 'allow' ? 'allow' : v.class
}

test('CU-500: purchase - confirm a withdrawal, a market order, convert everything, set leverage', () => {
  for (const name of ['Confirm withdrawal', 'Confirm withdrawals', 'Confirm your withdrawal', 'Confirm withdrawal request', 'Market sell', 'Sell at market', 'Place market order', 'Convert all', 'Convert everything', 'Convert entire balance to USDT', 'Set leverage to 100x', 'Change leverage', 'Use 50x leverage']) {
    assert.equal(at(name), 'purchase', name)
    assert.equal(at(name, true), 'purchase', `Space: ${name}`)
  }
})

test('CU-500: credential - a withdrawal address added or allowlisted; permission - the allowlist turned off', () => {
  for (const name of ['Add withdrawal address', 'Add new withdrawal address', 'Save wallet address', 'Whitelist address', 'Allowlist this address', 'Add to withdrawal whitelist', 'Add address to withdrawal allowlist']) assert.equal(at(name), 'credential', name)
  for (const name of ['Disable withdrawal whitelist', 'Turn off address allowlist', 'Switch off withdrawal whitelist']) assert.equal(at(name), 'permission', name)
})

test('CU-500 negatives: deposit address, markets, an ad-blocker whitelist, a bare Convert stay free', () => {
  for (const name of ['Deposit address', 'Markets', 'Copy deposit address', 'Convert', 'Disable whitelist', 'Leverage info']) assert.equal(at(name), 'allow', name)
})

test('CU-500: an older class stays (D-108) - Deactivate withdrawal lock keeps delete; Order book keeps its older order row (named for CU-429)', () => {
  assert.equal(at('Deactivate withdrawal lock'), 'delete')
  assert.equal(at('Order book'), 'purchase')
})

test('#680 round 3 (cu-researcher 13:02Z): a bare Add to allowlist asks credential on an exchange wallet URL, free elsewhere', () => {
  const on = (name, url) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url, target: { role: 'button', name } }); return v.decision === 'allow' ? 'allow' : v.class }
  for (const url of ['https://exchange.example/wallet/addresses', 'https://exchange.example/withdraw', 'https://exchange.example/account/address-book']) for (const name of ['Add to allowlist', 'Add to whitelist']) assert.equal(on(name, url), 'credential', `${name} on ${url}`)
  for (const url of ['https://mail.example/settings/filters', 'https://adblock.example/options']) assert.equal(on('Add to allowlist', url), 'allow', url)
})
