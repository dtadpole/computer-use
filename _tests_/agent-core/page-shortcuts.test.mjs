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
  assert.equal(policy.classify({ type: 'keypress', keys: ['E'] }, { url: 'app:com.example.mail', target: { role: 'AXRow', name: 'm' }, boundMenuItem: { name: 'Archive' } }).decision, 'allow', 'a desktop key that fires a menu item keeps the menu rules')
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

test('CU-363 round 3: hold_key, longer text on the body, and the desktop route ask; the key is the produced character', () => {
  const j = (action, target, url = 'https://mail.example/inbox', extra = {}) => policy.classify(action, { url, target, ...extra })
  assert.equal(j({ type: 'hold_key', keys: ['E'], duration_ms: 300 }, ROW).rule, 'page:shortcut', 'a held key')
  for (const text of ['###', 'ok #', 'hello']) assert.equal(j({ type: 'type', text }, null).rule, 'page:shortcut', `type ${text} on the body`)
  assert.equal(j({ type: 'keypress', keys: ['SHIFT', '3'] }, ROW).approvalKey, 'permission:page-shortcut:#', 'Shift+3 is #')
  assert.equal(j({ type: 'type', text: '#' }, ROW).approvalKey, 'permission:page-shortcut:#', 'the same key as a typed #')
  assert.notEqual(j({ type: 'keypress', keys: ['3'] }, ROW).approvalKey, 'permission:page-shortcut:#', "a bare '3' is another key")
  const desk = { role: 'AXRow', name: 'Message from Pat' }
  for (const action of [{ type: 'keypress', keys: ['E'] }, { type: 'type', text: '#' }, { type: 'hold_key', keys: ['E'], duration_ms: 300 }]) {
    assert.equal(j(action, desk, 'app:com.example.mail', { boundMenuItem: { none: true } }).rule, 'page:shortcut', `desktop ${action.type}`)
  }
  assert.equal(j({ type: 'type', text: '###' }, null, 'app:com.example.mail').rule, 'page:shortcut', 'desktop: no text entry focused (null) asks too')
  assert.equal(j({ type: 'type', text: '#' }, { role: 'link', name: 'Message from Pat' }).rule, 'page:shortcut', 'a typed key on a link asks like a keypress')
  assert.equal(j({ type: 'type', text: 'ok #' }, { role: 'link', name: 'Invoice from Acme' }).rule, 'page:shortcut', "'ok #' on a link: the space presses it, the rest reaches the page (cu-verifier 180522Z)")
  assert.equal(j({ type: 'type', text: ' ' }, { role: 'button', name: 'Archive' }).rule === 'page:shortcut', false, 'a typed space alone is the activation rule')
  assert.equal(j({ type: 'keypress', keys: ['SHIFT', '3'] }, ROW).runOnly, true, "an 'always' answer is capped at the run")
})
