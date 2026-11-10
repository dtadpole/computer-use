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

// CU-402 (High): a bare 'Sell' beside an asset select in a form is a trade - the policy reads the driver's formContext
// ({options, amountEntry}, cu-developer-two's #472). Both sides; one row through runTask (D-103).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const press = (name, formContext) => { const v = policy.classify({ type: 'click', x: 1, y: 1, button: 'left' }, { url: 'https://exchange.example/trade', target: { tag: 'button', role: 'button', name, ...(formContext ? { formContext } : {}) } }); return v.decision === 'allow' ? 'allow' : v.class }
const tmp = mkdtempSync(join(tmpdir(), 'cu-402-'))
after(() => rmSync(tmp, { recursive: true, force: true }))

test('CU-402: a bare Sell/Convert/Deposit with an asset among the selected options asks purchase', () => {
  assert.equal(press('Sell', { options: ['BTC'], amountEntry: false }), 'purchase')
  assert.equal(press('Convert', { options: ['Ethereum'], amountEntry: true }), 'purchase')
  assert.equal(press('Deposit', { options: ['USDC'], amountEntry: false }), 'purchase')
  for (const name of ['Place', 'Place order', 'Confirm', 'Submit']) assert.equal(press(name, { options: ['ETH'], amountEntry: true }), 'purchase', name)
})

test('CU-402 negatives: no form context, or options that name no asset and no amount entry, stay free', () => {
  assert.equal(press('Sell'), 'allow')
  assert.equal(press('Sell', { options: ['Used - good'], amountEntry: false }), 'allow')
  assert.equal(press('Convert', { options: ['PDF'], amountEntry: false }), 'allow')
  assert.equal(press('Sell', { options: [], amountEntry: true }), 'allow', 'an amount entry alone (a marketplace price) never counts')
  assert.equal(press('Sell', { options: ['Used - good'], amountEntry: true }), 'allow')
  for (const name of ['Continue', 'Next', 'Review']) assert.equal(press(name, { options: ['ETH'], amountEntry: true }), 'allow', name)
  assert.equal(press('Submit', { options: ['Medium'], amountEntry: false }), 'submit', 'a size form keeps its plain submit')
})

test('CU-402 through the loop: the inspected button carries formContext and the click is declined', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'browser', control, url: 'https://exchange.example/trade', targets: () => ({ origin: 'https://exchange.example', tag: 'button', role: 'button', name: 'Sell', formContext: { options: ['BTC'], amountEntry: true } }) })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'click', x: 100, y: 100, button: 'left' }] }, { final: 'done' }] })
  const result = await runTask({ task: 'trade', environment, model, control, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, sitePolicy: createSitePolicy({ allowed: ['https://exchange.example'] }) })
  const ev = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action' && e.action?.type === 'click')
  assert.equal(ev.class, 'purchase')
  assert.notEqual(ev.status, 'done')
})
