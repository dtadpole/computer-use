import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy, serviceShortcut } from '../../_tools_/agent-core/app-policy.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'

// CU-249 (cu-researcher): the default macOS Services shortcuts act outside the approved app, and fire only when the app
// in front binds nothing to the chord. Refused unless the menu read found an app item for it.
const FIXTURE = 'ai.reflection.cu.fixture'
const tmp = mkdtempSync(join(tmpdir(), 'cu-249-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
store.grantAlways(FIXTURE, { by: 'api' })
const policy = createAppPolicy({ scope: [FIXTURE], approvals: store })
const field = { origin: FIXTURE, role: 'AXTextField', name: 'Notes', editable: true, fingerprint: 'n', defaultButtonRead: true }
const judge = (keys, boundMenuItem) => policy.classify({ type: 'keypress', keys }, { frontmostBundleId: FIXTURE, target: field, ...(boundMenuItem !== undefined ? { boundMenuItem } : {}) })
const CHORDS = [[['META', 'SHIFT', 'L'], 'Search With'], [['META', 'SHIFT', 'Y'], 'Make Sticky'], [['META', 'SHIFT', 'B'], 'Bluetooth'],
  [['META', 'SHIFT', '8'], 'AppleScript'], [['META', '*'], 'AppleScript'], [['META', 'SHIFT', 'M'], 'Terminal'], [['META', 'SHIFT', 'A'], 'Terminal']]

test('CU-249: a default Services chord with no app item bound - none, unreadable or no read - is refused, naming the service', () => {
  for (const [keys, name] of CHORDS) {
    for (const bound of [undefined, { none: true }, { unreadable: true }]) {
      const v = judge(keys, bound)
      assert.deepEqual([v.decision, v.rule], ['block', 'system_shortcut'], `${keys.join('+')} with ${JSON.stringify(bound)}`)
      assert.match(v.reason, new RegExp(name))
    }
  }
})

test('CU-249: an app item bound to the chord is judged as a click on it instead - benign allowed, consequential asked', () => {
  assert.equal(judge(['META', 'SHIFT', 'L'], { role: 'AXMenuItem', name: 'Show Sidebar' }).decision, 'allow')
  assert.equal(judge(['META', 'SHIFT', 'A'], { items: [{ role: 'AXMenuItem', name: 'Select None' }] }).decision, 'allow')
  const send = judge(['META', 'SHIFT', 'B'], { role: 'AXMenuItem', name: 'Send' })
  assert.deepEqual([send.decision, send.class], ['confirm', 'submit'])
})

test('CU-249: matched exactly, as key equivalents are - other modifiers or letters are judged as before', () => {
  for (const keys of [['META', 'L'], ['META', 'ALT', 'SHIFT', 'L'], ['META', 'SHIFT', 'K'], ['CTRL', 'SHIFT', 'L'], ['META', '8']]) {
    assert.equal(serviceShortcut({ type: 'keypress', keys }), null, keys.join('+'))
    assert.equal(judge(keys, { none: true }).decision, 'allow', keys.join('+'))
  }
})

test('CU-249 through the loop: Command-Shift-L in a field with no menu read is refused, nothing posted', async () => {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control })
  environment.focusedElement = async () => field
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'keypress', keys: ['META', 'SHIFT', 'L'] }] }, { final: 'done' }] })
  const result = await runTask({ task: 'look it up', environment, model, control, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const action = events.find((e) => e.kind === 'action')
  assert.deepEqual([action.decision, action.rule], ['block', 'system_shortcut'])
  assert.equal(environment.log.filter((x) => (x.action ?? x)?.type).length, 0, 'nothing posted')
})

test('CU-249 click route: a Services item clicked in a menu is refused too - by the helper flag or a default service title', () => {
  const click = { type: 'click', x: 1, y: 1, button: 'left' }
  const at = (t) => policy.classify(click, { frontmostBundleId: FIXTURE, target: { origin: FIXTURE, fingerprint: 'm', ...t } })
  for (const name of ['Search With Google', 'Get Result of AppleScript', 'Run as AppleScript', 'Make New Sticky Note', 'Send File To Bluetooth Device', 'Open man Page in Terminal', 'New Terminal at Folder']) {
    const v = at({ role: 'AXMenuItem', name })
    assert.deepEqual([v.decision, v.rule], ['block', 'system_service'], name)
  }
  assert.equal(at({ role: 'AXMenuItem', name: 'Translate', servicesMenu: true }).rule, 'system_service', 'any title under the helper flag')
  for (const t of [{ role: 'AXMenuItem', name: 'Search' }, { role: 'AXMenuItem', name: 'Make Plain Text' }, { role: 'AXButton', name: 'Search With Google' }]) {
    assert.equal(at(t).decision, 'allow', `${t.role} ${t.name}`)
  }
})
