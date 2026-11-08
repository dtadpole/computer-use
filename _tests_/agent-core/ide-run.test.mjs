import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-271 (cu-researcher; cu-coordinator 14:22Z: High, ask - not exclude): running code in an approved IDE asks.
const VSCODE = 'com.microsoft.VSCode'
const XCODE = 'com.apple.dt.Xcode'
const TEXTEDIT = 'com.apple.TextEdit'
const tmp = mkdtempSync(join(tmpdir(), 'cu-271-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
const store = createAppApprovals({ path: join(tmp, 'a.json') })
for (const id of [VSCODE, XCODE, TEXTEDIT, 'com.jetbrains.pycharm']) store.grantAlways(id, { by: 'api' })
const policy = createAppPolicy({ scope: [VSCODE, XCODE, TEXTEDIT, 'com.jetbrains.pycharm'], approvals: store, preApprovals: [{ class: 'launch_code' }, { class: 'unknown_target' }] })
const click = { type: 'click', x: 1, y: 1, button: 'left' }
const control = (app, name, role = 'AXButton') => ({ origin: app, role, name, fingerprint: name, defaultButtonRead: true })
const editor = (app) => ({ origin: app, role: 'AXTextArea', name: 'Editor', editable: true, fingerprint: 'ed', defaultButtonRead: true })
const judge = (app, action, target, extra = {}) => policy.classify(action, { frontmostBundleId: app, target, boundMenuItem: { none: true }, ...extra })

test('CU-271: a run or debug control in an IDE asks launch_code, never pre-approved', () => {
  for (const [app, name] of [[VSCODE, 'Run Python File'], [VSCODE, 'Start Debugging'], [VSCODE, 'Run Without Debugging'], [VSCODE, 'Run Cell'], [VSCODE, 'Run All'], [XCODE, 'Run'], [XCODE, 'Build and Run'], ['com.jetbrains.pycharm', "Run 'main'"]]) {
    const v = judge(app, click, control(app, name))
    assert.deepEqual([v.decision, v.class, v.rule], ['confirm', 'launch_code', 'ide:run'], `${app} ${name}`)
  }
})

test('CU-271: the run chords in an IDE ask - F5 with any modifiers, Command-R, Shift- or Control-Return, a chord whose menu item is Run', () => {
  for (const keys of [['F5'], ['CTRL', 'F5'], ['SHIFT', 'F5'], ['META', 'R'], ['SHIFT', 'ENTER'], ['CTRL', 'ENTER']]) {
    assert.equal(judge(VSCODE, { type: 'keypress', keys }, editor(VSCODE)).rule, 'ide:run', keys.join('+'))
  }
  const bound = judge(XCODE, { type: 'keypress', keys: ['META', 'SHIFT', 'K'] }, editor(XCODE), { boundMenuItem: { items: [{ role: 'AXMenuItem', name: 'Run Tests', enabled: true }] } })
  assert.equal(bound.rule, 'ide:run', 'a chord the menu read binds to a run item')
})

test('CU-271: typing code and ordinary controls in an IDE stay free; Run in a non-IDE app is judged as before', () => {
  assert.equal(judge(VSCODE, { type: 'type', text: 'print(1)' }, editor(VSCODE)).decision, 'allow')
  assert.equal(judge(VSCODE, { type: 'keypress', keys: ['ENTER'] }, editor(VSCODE)).decision, 'allow')
  assert.equal(judge(VSCODE, click, control(VSCODE, 'Explorer')).decision, 'allow')
  assert.equal(judge(VSCODE, click, control(VSCODE, 'Runtime settings')).decision, 'allow', 'whole words only')
  assert.equal(judge(TEXTEDIT, click, control(TEXTEDIT, 'Run')).decision, 'allow', 'not an IDE')
  assert.equal(judge(TEXTEDIT, { type: 'keypress', keys: ['F5'] }, editor(TEXTEDIT)).decision, 'allow')
})

test('CU-271 through the loop: Start Debugging in VS Code is declined unattended, nothing posted', async () => {
  const runControl = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control: runControl, frontmost: VSCODE })
  environment.inspectPoint = async () => control(VSCODE, 'Start Debugging')
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [click] }, { final: 'done' }] })
  const result = await runTask({ task: 'fix the bug', environment, model, control: runControl, runsDirectory: join(tmp, 'runs'), build: { commit: 'test', dirty: false }, apps: [VSCODE], appApprovals: store })
  const action = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action')
  assert.deepEqual([action.decision, action.class], ['confirm', 'launch_code'])
  assert.equal(environment.log.filter((x) => (x.action ?? x)?.type).length, 0)
})

test('CU-271 on cu-researcher\'s review: Build and Test run code too - by click or by the chord their menu item binds; a menu-bar title only opens its menu', () => {
  for (const name of ['Build', 'Test', 'Run Tests', 'Build For Testing']) {
    assert.deepEqual([judge(XCODE, click, control(XCODE, name, 'AXMenuItem')).class, judge(XCODE, click, control(XCODE, name, 'AXMenuItem')).rule], ['launch_code', 'ide:run'], name)
  }
  const bound = (name) => ({ items: [{ role: 'AXMenuItem', name, enabled: true }] })
  assert.equal(judge(XCODE, { type: 'keypress', keys: ['META', 'U'] }, editor(XCODE), { boundMenuItem: bound('Test') }).rule, 'ide:run', 'Command-U bound to Test')
  assert.equal(judge(XCODE, { type: 'keypress', keys: ['META', 'B'] }, editor(XCODE), { boundMenuItem: bound('Build') }).rule, 'ide:run', 'Command-B bound to Build')
  assert.notEqual(judge(VSCODE, click, control(VSCODE, 'Run', 'AXMenuBarItem')).rule, 'ide:run', 'the Run menu-bar title only opens its menu')
})
