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
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-361 (cu-coordinator 20:23Z): the helper's nearbyLabel is an upgrade-only name, and a value-shaped one is never a
// name and never recorded - agent core is the guarantee, whatever the helper passes.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const APP = 'com.example.app'
const box = (extra) => ({ origin: APP, role: 'AXTextField', name: null, editable: true, ...extra })
const judge = (target, text) => { const v = policy.classify({ type: 'type', text }, { url: `app:${APP}`, target }); return v.decision === 'allow' ? 'allow' : v.class }
const CARD = ['4111', '1111', '1111', '1111'].join(' ')

test('CU-361: a nearby label makes a box ask by name - Password, CVV - and never downgrades a title', () => {
  assert.equal(judge(box({ nearbyLabel: 'Password' }), 'hunter2x'), 'credential')
  assert.equal(judge(box({ nearbyLabel: 'CVV' }), '123'), 'sensitive_data')
  assert.equal(judge(box({ name: 'CVV', nearbyLabel: 'Search' }), '123'), 'sensitive_data', 'upgrade only')
  assert.equal(judge(box({ nearbyLabel: 'Your name' }), 'Pat'), 'allow')
})

test('CU-361: a value-shaped nearby text (a card) is never a name', () => {
  assert.equal(judge(box({ nearbyLabel: CARD }), 'hello'), 'allow')
})

const tmp = mkdtempSync(join(tmpdir(), 'cu-361-'))
after(() => rmSync(tmp, { recursive: true, force: true }))

test('CU-361 in the loop: a card-shaped nearbyLabel never reaches the run record', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control, frontmost: APP, focused: box({ nearbyLabel: CARD, fingerprint: 'f', fieldKey: 'k' }) })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'type', text: 'hello' }] }, { final: 'done' }] })
  const { createAppApprovals } = await import('../../_tools_/agent-core/app-approvals.mjs')
  const approvals = createAppApprovals({ path: join(tmp, 'a.json') })
  approvals.grantAlways(APP, { by: 'api' })
  const result = await runTask({ task: 'write a note', environment, model, control, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, apps: [APP], appApprovals: approvals })
  const text = JSON.stringify(readRun(result.trajectoryDir).events)
  assert.equal(text.includes('4111'), false, 'the card never appears in the events')
})
