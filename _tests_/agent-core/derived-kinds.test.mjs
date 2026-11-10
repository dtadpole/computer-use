import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-391 (D-103): an action record carries the loop-derived context the policy judged on, as kinds and booleans only.
const tmp = mkdtempSync(join(tmpdir(), 'cu-391-'))
after(() => rmSync(tmp, { recursive: true, force: true }))

test('CU-391: a desktop drag record carries dragSource as a kind, never the row name', async () => {
  const FINDER = 'com.apple.finder'
  const SLACK = 'com.tinyspeck.slackmacgap'
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control, frontmost: FINDER, targets: ({ x }) => (x < 200 ? { origin: FINDER, role: 'AXRow', name: 'secret-plan' } : { origin: SLACK, role: 'AXGroup', name: 'Message' }) })
  const approvals = createAppApprovals({ path: join(tmp, 'a.json') })
  for (const app of [FINDER, SLACK]) approvals.grantAlways(app, { by: 'api' })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'drag', path: [{ x: 100, y: 100 }, { x: 600, y: 400 }] }] }, { final: 'done' }] })
  const result = await runTask({ task: 'tidy', environment, model, control, runsDirectory: join(tmp, 'drag'), build: { commit: 'test', dirty: false }, apps: [FINDER, SLACK], appApprovals: approvals })
  const drag = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action' && e.action?.type === 'drag')
  assert.equal(drag.derived?.dragSource, 'file')
  assert.equal(drag.derived?.dropTarget, 'other_app')
  assert.equal(JSON.stringify(drag.derived).includes('secret'), false, 'kinds only')
})

test('CU-391: a browser type into a select carries typeOptions read or unread', async () => {
  const { createSitePolicy } = await import('../../_tools_/agent-core/sites.mjs')
  for (const [answer, kind] of [[[{ role: 'option', name: 'Archive' }], 'read'], [{ unread: true }, 'unread']]) {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'browser', control, url: 'https://shop.example/orders', focused: { origin: 'https://shop.example', tag: 'select', role: 'combobox', name: 'Bulk actions', editable: false } })
    environment.typeOptions = async () => answer
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'type', text: 'Ar' }] }, { final: 'done' }] })
    const result = await runTask({ task: 'tidy', environment, model, control, runsDirectory: join(tmp, kind), build: { commit: 'test', dirty: false }, sitePolicy: createSitePolicy({ allowed: ['https://shop.example'] }) })
    const typed = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action' && e.action?.type === 'type')
    assert.equal(typed.derived?.typeOptions, kind)
  }
})

test('CU-391: a null drop logs dropTarget unread; an unreadable bound menu logs unreadable', async () => {
  const FINDER = 'com.apple.finder'
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control, frontmost: FINDER, targets: ({ x }) => (x < 200 ? { origin: FINDER, role: 'AXRow', name: 'report' } : null) })
  const approvals = createAppApprovals({ path: join(tmp, 'b.json') })
  approvals.grantAlways(FINDER, { by: 'api' })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'drag', path: [{ x: 100, y: 100 }, { x: 900, y: 500 }] }] }, { final: 'done' }] })
  const result = await runTask({ task: 'tidy', environment, model, control, runsDirectory: join(tmp, 'nulldrop'), build: { commit: 'test', dirty: false }, apps: [FINDER], appApprovals: approvals })
  const drag = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action' && e.action?.type === 'drag')
  assert.equal(drag.derived?.dropTarget, 'unread')
  const control2 = createRunControl()
  const env2 = createFakeEnvironment({ kind: 'desktop', control: control2, frontmost: FINDER, focused: { origin: FINDER, role: 'AXRow', name: 'report' } })
  env2.menuItemForChord = async () => { throw new Error('menu bar unreadable') }
  const model2 = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'keypress', keys: ['META', 'J'] }] }, { final: 'done' }] })
  const result2 = await runTask({ task: 'tidy', environment: env2, model: model2, control: control2, runsDirectory: join(tmp, 'unreadable'), build: { commit: 'test', dirty: false }, apps: [FINDER], appApprovals: approvals })
  const pressed = readRun(result2.trajectoryDir).events.find((e) => e.kind === 'action' && e.action?.type === 'keypress')
  assert.equal(pressed.derived?.boundMenuItem, 'unreadable')
})

test('CU-391: a press target whose file name was lent by its row logs fileFrom ancestor (a kind, never the name)', async () => {
  const FINDER = 'com.apple.finder'
  const SLACK = 'com.tinyspeck.slackmacgap'
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control, frontmost: FINDER, targets: ({ x }) => (x < 200 ? { origin: FINDER, role: 'AXStaticText', name: 'plan', filename: 'secret-plan.pdf', fileFrom: 'ancestor' } : { origin: SLACK, role: 'AXGroup', name: 'Message' }) })
  const approvals = createAppApprovals({ path: join(tmp, 'c.json') })
  for (const app of [FINDER, SLACK]) approvals.grantAlways(app, { by: 'api' })
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'drag', path: [{ x: 100, y: 100 }, { x: 600, y: 400 }] }] }, { final: 'done' }] })
  const result = await runTask({ task: 'tidy', environment, model, control, runsDirectory: join(tmp, 'lent'), build: { commit: 'test', dirty: false }, apps: [FINDER, SLACK], appApprovals: approvals })
  const drag = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action' && e.action?.type === 'drag')
  assert.equal(drag.derived?.fileFrom, 'ancestor')
  assert.equal(drag.derived?.dragSource, 'file')
  assert.equal(JSON.stringify(drag.derived).includes('secret'), false)
})
