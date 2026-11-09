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

// CU-365 (Medium, policy probe; design note 0.1): a Control, Option or Command chord with one printable key outside a
// text entry reaches the page or app like '#' does (CU-363); and a page shortcut stacked under another class keeps its
// own approval, so a yes for that class never frees the page's handlers (cu-researcher 18:19Z).
const policy = createPolicy({ sitePolicy: () => 'allow' })
const ROW = { role: 'option', name: 'Message from Pat' }
const judge = (keys, target, url = 'https://mail.example/inbox', extra = {}) => policy.classify({ type: 'keypress', keys }, { url, target, ...extra })

test('CU-365: chords outside a text entry ask as page or app shortcuts, keyed by the chord', () => {
  for (const [keys, key] of [[['CTRL', 'D'], 'ctrl+d'], [['ALT', 'D'], 'alt+d'], [['META', 'D'], 'cmd+d'], [['CTRL', 'E'], 'ctrl+e'], [['CTRL', 'SHIFT', '3'], 'ctrl+#']]) {
    const v = judge(keys, ROW)
    assert.equal(v.rule, 'page:shortcut', keys.join('+'))
    assert.equal(v.approvalKey, `permission:page-shortcut:${key}`)
  }
  assert.equal(judge(['CTRL', 'D'], { role: 'AXRow', name: 'm' }, 'app:com.example.mail', { boundMenuItem: { none: true } }).rule, 'page:shortcut', 'desktop, no menu item')
})

test('CU-365 negatives: the editing set, the browser chords, a menu item, and a text entry keep their rules', () => {
  for (const keys of [['META', 'C'], ['META', 'A'], ['META', 'Z'], ['META', 'SHIFT', 'Z'], ['CTRL', 'X'], ['META', 'F'], ['META', 'G'], ['CTRL', 'F'], ['META', 'T'], ['META', 'R'], ['META', 'L']]) {
    assert.notEqual(judge(keys, ROW).rule, 'page:shortcut', keys.join('+'))
  }
  assert.equal(judge(['CTRL', 'D'], { role: 'AXRow', name: 'm' }, 'app:com.example.mail', { boundMenuItem: { name: 'Duplicate' } }).decision, 'allow', 'a desktop chord that fires a menu item')
  assert.equal(judge(['CTRL', 'D'], { tag: 'input', role: 'textbox', name: 'Notes', editable: true }).decision, 'allow', 'a chord into a field')
})

test('CU-365 stacking: a page shortcut under another class names its own approval', () => {
  const v = policy.classify({ type: 'type', text: ['4111', '1111', '1111', '1111'].join(' ') }, { url: 'https://mail.example/inbox', target: { role: 'link', name: 'Invoice' } })
  assert.equal(v.class, 'sensitive_data')
  assert.match(String(v.alsoNeeds), /^permission:page-shortcut:/)
  assert.deepEqual(v.classes, ['sensitive_data', 'permission'], "'permission' stacks beside the leading class")
  assert.match(v.reason, /may also trigger a keyboard shortcut of the page/, 'the question names the shortcut half')
  assert.equal(v.reason.includes('4111'), false, 'and never echoes the typed text')
})

const tmp = mkdtempSync(join(tmpdir(), 'cu-365-'))
after(() => rmSync(tmp, { recursive: true, force: true }))

test('CU-365 stacking in the loop: a run yes for the card in a field does not free the same card typed on a link', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'browser', control, url: 'https://mail.example/inbox' })
  const FIELD = { tag: 'input', inputType: 'text', role: 'textbox', name: 'Card number', editable: true, fingerprint: 'card' }
  const LINK = { role: 'link', name: 'Invoice from Acme', fingerprint: 'link' }
  let typed = 0
  const perform = environment.perform.bind(environment)
  environment.perform = async (action, ...rest) => { const out = await perform(action, ...rest); if (action.type === 'type') typed += 1; return out }
  environment.focusedElement = async () => (typed === 0 ? FIELD : LINK)
  const card = ['4111', '1111', '1111', '1111'].join(' ')
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'type', text: card }, { type: 'type', text: card }] }, { final: 'done' }] })
  const controller = apiController()
  let asked = 0
  let running = true
  const answering = (async () => { while (running) { const request = await controller.waitForRequest(200).catch(() => null); if (request) { asked += 1; controller.respond({ id: request.id, approved: true, lifetime: 'run' }) } } })()
  await runTask({ task: 'pay the invoice', environment, model, control, controller, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, sitePolicy: createSitePolicy({ allowed: ['https://mail.example'] }) })
  running = false
  await answering
  assert.equal(asked, 2, 'the card in the field asked once; on the link its shortcut half asked again')
})
