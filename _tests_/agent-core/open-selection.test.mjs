import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'

// CU-252 (cu-researcher; note 0.1 on the issue): opening the SELECTION runs it too, and the loop reads no selection.
const FINDER = 'com.apple.finder'
const FIXTURE = 'ai.reflection.cu.fixture'
const policy = createAppPolicy({ scope: [FINDER, FIXTURE] })
policy.grantScope(FINDER, { approved: true, answeredBy: 'api' })
policy.grantScope(FIXTURE, { approved: true, answeredBy: 'api' })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const key = (...keys) => ({ type: 'keypress', keys })
const at = (app, action, target, extra = {}) => policy.classify(action, { frontmostBundleId: app, target: target ? { origin: app, fingerprint: 't', ...target } : null, ...extra })
const verdict = (v) => [v.decision, v.class ?? null, v.rule]

test('CU-252 rule 1: in Finder, File > Open or a context menu Open asks launch_code - the selected file is unread', () => {
  assert.deepEqual(verdict(at(FINDER, click, { role: 'AXMenuItem', name: 'Open' })), ['confirm', 'launch_code', 'selection:launch_code'])
  assert.equal(at(FINDER, click, { role: 'AXMenuItem', name: 'Open Recent' }).decision, 'allow', 'not the Open item')
  assert.equal(at(FIXTURE, click, { role: 'AXMenuItem', name: 'Open' }).decision, 'allow', 'outside a file browser, Open opens a document picker')
})

test('CU-252 rule 1: in Finder, Command-O or Command-Down with a list, column or icon view focused asks; a named document focused does not', () => {
  for (const role of ['AXOutline', 'AXTable', 'AXBrowser', 'AXGroup', 'AXList']) {
    for (const keys of [['META', 'O'], ['META', 'ARROWDOWN']]) {
      assert.deepEqual(verdict(at(FINDER, key(...keys), { role, name: '' })), ['confirm', 'launch_code', 'selection:launch_code'], `${role} ${keys.join('+')}`)
    }
  }
  assert.deepEqual(verdict(at(FINDER, key('META', 'O'), null)), ['confirm', 'launch_code', 'selection:launch_code'], 'nothing focused')
  assert.equal(at(FINDER, key('META', 'O'), { role: 'AXRow', name: 'report.pdf' }).decision, 'allow', 'a named document row is judged by its own name')
  assert.deepEqual(verdict(at(FINDER, key('META', 'O'), { role: 'AXRow', name: 'install.command' })), ['confirm', 'launch_code', 'target:launch_code'], 'a launchable row keeps target:launch_code')
  assert.equal(at(FINDER, key('META', 'C'), { role: 'AXOutline', name: '' }).decision, 'allow', 'other chords are untouched')
})

test('CU-252 rule 2: a menu item titled as an excluded runner (Open With > Terminal) is refused anywhere, clicked or bound to a chord', () => {
  for (const name of ['Terminal', 'Script Editor', 'Automator', 'iTerm', 'iTerm2']) {
    for (const app of [FINDER, FIXTURE]) {
      assert.deepEqual(verdict(at(app, click, { role: 'AXMenuItem', name })), ['block', null, 'excluded:terminal'], `${app} ${name}`)
    }
  }
  assert.deepEqual(verdict(at(FIXTURE, key('META', 'ALT', 'T'), { role: 'AXTextField', name: 'Notes', editable: true, defaultButtonRead: true }, { boundMenuItem: { role: 'AXMenuItem', name: 'Terminal' } })), ['block', null, 'excluded:terminal'], 'a chord bound to it')
  for (const name of ['New Terminal', 'Terminal Settings', 'TextEdit']) assert.equal(at(FIXTURE, click, { role: 'AXMenuItem', name }).decision, 'allow', name)
  assert.equal(at(FIXTURE, click, { role: 'AXButton', name: 'Terminal' }).decision, 'allow', 'only a menu item')
})

test('CU-252 through the loop: a click on Open With > Terminal is refused, nothing posted', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { createScriptedAdapter } = await import('../../_tools_/agent-core/adapter-scripted.mjs')
  const { createAppApprovals } = await import('../../_tools_/agent-core/app-approvals.mjs')
  const { createRunControl } = await import('../../_tools_/agent-core/control.mjs')
  const { createFakeEnvironment } = await import('../../_tools_/agent-core/fake-env.mjs')
  const { runTask } = await import('../../_tools_/agent-core/loop.mjs')
  const { readRun } = await import('../../_tools_/agent-core/trajectory.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'cu-252-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control })
    environment.inspectPoint = async () => ({ origin: FIXTURE, role: 'AXMenuItem', name: 'Terminal', fingerprint: 'm' })
    const store = createAppApprovals({ path: join(dir, 'a.json') })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [click] }, { final: 'done' }] })
    const result = await runTask({ task: 'open it', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const action = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action')
    assert.deepEqual([action.decision, action.rule], ['block', 'excluded:terminal'])
    assert.equal(environment.log.filter((x) => (x.action ?? x)?.type).length, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
