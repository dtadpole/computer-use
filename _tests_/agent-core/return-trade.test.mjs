import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-406 (High): Return in a trade form's amount field presses the default button; the trade clause reads the default
// button's name and formContext as a click does. Both sides; one row through runTask (D-103).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const enter = (defaultButton) => { const v = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { url: 'https://exchange.example/trade', target: { tag: 'input', role: 'textbox', name: 'Amount', defaultButtonRead: true, defaultButton } }); return v.decision === 'allow' ? 'allow' : v.class }
const tmp = mkdtempSync(join(tmpdir(), 'cu-406-'))
after(() => rmSync(tmp, { recursive: true, force: true }))

test('CU-406: Return with a trade default button asks purchase', () => {
  assert.equal(enter({ name: 'Sell BTC' }), 'purchase')
  assert.equal(enter({ name: 'Convert 0.5 ETH' }), 'purchase')
  assert.equal(enter({ name: 'Sell', formContext: { options: ['BTC'], amountEntry: true } }), 'purchase')
  assert.equal(enter({ name: 'Place order', formContext: { options: ['ETH'], amountEntry: true } }), 'purchase')
  assert.equal(enter({ name: 'Confirm', formContext: { options: ['USDC'], amountEntry: false } }), 'purchase')
})

test('CU-406 negatives: a non-trade default, or no asset option, keeps today\'s judgement', () => {
  assert.notEqual(enter({ name: 'Search', formContext: { options: ['BTC'], amountEntry: false } }), 'purchase')
  assert.notEqual(enter({ name: 'Sell', formContext: { options: ['Used - good'], amountEntry: true } }), 'purchase')
  assert.notEqual(enter({ name: 'Sell', formContext: { options: [], amountEntry: true } }), 'purchase', 'an amount entry alone never counts (05:26Z)')
  assert.notEqual(enter({ name: 'Convert', formContext: { options: ['PDF'], amountEntry: false } }), 'purchase')
})

test('CU-406 through the loop: Return in the amount field with a Sell default beside an asset option is declined', async () => {
  const control = createRunControl()
  const focused = { origin: 'https://exchange.example', tag: 'input', role: 'textbox', name: 'Amount', defaultButtonRead: true, defaultButton: { name: 'Sell', formContext: { options: ['BTC'], amountEntry: true } } }
  const environment = createFakeEnvironment({ kind: 'browser', control, url: 'https://exchange.example/trade', focused, targets: () => focused })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'keypress', keys: ['ENTER'] }] }, { final: 'done' }] })
  const result = await runTask({ task: 'trade', environment, model, control, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, sitePolicy: createSitePolicy({ allowed: ['https://exchange.example'] }) })
  const ev = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action' && e.action?.type === 'keypress')
  assert.equal(ev.class, 'purchase')
  assert.notEqual(ev.status, 'done')
})
