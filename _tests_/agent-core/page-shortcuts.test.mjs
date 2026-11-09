import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { apiController } from '../../_tools_/agent-core/consent.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-363 (High pending a live row): a printable key pressed outside text entry on a web page goes to the page's own
// handler (Gmail '#' deletes), so it asks once per site and run.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const ROW = { role: 'row', name: 'Message from Pat' }
const press = (keys, target, url = 'https://mail.example/inbox') => { const r = policy.classify({ type: 'keypress', keys }, { url, target }); return r.decision === 'allow' ? 'allow' : `${r.class}/${r.rule}` }

test('CU-363: a printable key on a row, the page body or an unread focus asks as a page shortcut', () => {
  for (const [keys, target] of [[['SHIFT', '3'], ROW], [['E'], ROW], [['#'], { role: 'document' }], [['J'], null]]) {
    assert.equal(press(keys, target), 'permission/page:shortcut', JSON.stringify(keys))
  }
})

test('CU-363: a type action outside text entry carries the same keys to the page (cu-verifier 172724Z)', () => {
  const type = (text, target) => { const r = policy.classify({ type: 'type', text }, { url: 'https://mail.example/inbox', target }); return r.decision === 'allow' ? 'allow' : `${r.class}/${r.rule}` }
  assert.equal(type('#', null), 'permission/page:shortcut')
  assert.equal(type('#', { role: 'document' }), 'permission/page:shortcut')
  assert.equal(type('#', { tag: 'input', role: 'searchbox', name: 'Search mail', editable: true }), 'allow')
})

test('CU-363 unchanged: typing into a field, DELETE on a row, Tab, Command chords, Return on a button, the desktop route', () => {
  assert.equal(press(['A'], { tag: 'input', role: 'textbox', editable: true }), 'allow')
  assert.equal(press(['DELETE'], ROW), 'delete/class:delete')
  assert.equal(press(['TAB'], ROW), 'allow')
  assert.equal(press(['CMD', 'C'], ROW), 'allow')
  assert.equal(press(['E'], ROW, 'app:com.example.mail'), 'allow')
})

const tmp = mkdtempSync(join(tmpdir(), 'cu-363-'))
after(() => rmSync(tmp, { recursive: true, force: true }))

test('CU-363: a run approval covers that key on that site only - a different key asks again (cu-researcher)', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'browser', control, url: 'https://mail.example/inbox' })
  environment.focusedElement = async () => ROW
  environment.inspectPoint = async () => ROW
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'keypress', keys: ['E'] }, { type: 'keypress', keys: ['E'] }, { type: 'keypress', keys: ['J'] }] }, { final: 'done' }] })
  const controller = apiController()
  let asked = 0
  let running = true
  const answering = (async () => { while (running) { const request = await controller.waitForRequest(200).catch(() => null); if (request) { asked += 1; controller.respond({ id: request.id, approved: true, lifetime: 'run' }) } } })()
  const result = await runTask({ task: 'tidy my inbox', environment, model, control, controller, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, sitePolicy: createSitePolicy({ allowed: ['https://mail.example'] }) })
  running = false
  await answering
  const presses = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && e.status !== 'attempted' && e.action?.type === 'keypress')
  assert.equal(presses.length, 3)
  assert.equal(asked, 2, 'E asked once for the run, J asked again')
})
