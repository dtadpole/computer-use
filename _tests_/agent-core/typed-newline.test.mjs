import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-142: a typed newline is ENTER on the focused element, judged exactly as a keypress ENTER there.

const policy = createPolicy({ sitePolicy: () => 'allow' })
const decide = (action, target) => policy.classify(action, { url: 'http://127.0.0.1:4000/', target })

test('a newline typed into a field named like send or reply asks submit, as ENTER there does', () => {
  for (const target of [{ role: 'AXTextField', name: 'Send a message' }, { role: 'textbox', name: 'Reply' }]) {
    const enter = decide({ type: 'keypress', keys: ['ENTER'] }, target)
    const typed = decide({ type: 'type', text: 'hi there\n' }, target)
    assert.deepEqual([typed.decision, typed.class], [enter.decision, enter.class], target.name)
    assert.deepEqual([typed.decision, typed.class], ['confirm', 'submit'])
  }
})

test('a newline into a field with no consequential name, and text without a newline, are allowed', () => {
  assert.equal(decide({ type: 'type', text: 'line one\nline two' }, { role: 'AXTextArea', name: 'Notes' }).decision, 'allow')
  assert.equal(decide({ type: 'type', text: 'hi there' }, { role: 'AXTextField', name: 'Send a message' }).decision, 'allow', 'no Return, nothing sent')
})

test('a Return is judged by the window\'s default button too, from a single-line input (CU-142)', () => {
  const field = { role: 'AXTextField', name: null, defaultButton: { role: 'AXButton', name: 'Send', panel: null } }
  assert.deepEqual([decide({ type: 'keypress', keys: ['ENTER'] }, field).decision, decide({ type: 'keypress', keys: ['ENTER'] }, field).class], ['confirm', 'submit'], 'ENTER in an unnamed field whose default is Send')
  assert.equal(decide({ type: 'type', text: 'ok\n' }, field).class, 'submit', 'a typed newline there')
  assert.equal(decide({ type: 'type', text: 'ok' }, field).decision, 'allow', 'no Return, nothing pressed')
  assert.equal(decide({ type: 'keypress', keys: ['ENTER'] }, { ...field, defaultButton: { role: 'AXButton', name: 'OK', panel: null } }).decision, 'allow', 'a benign default')
  assert.equal(decide({ type: 'keypress', keys: ['ENTER'] }, { role: 'AXTextField', name: null }).decision, 'allow', 'no default button reported: the field\'s name only')
})

test('in a text area a Return is text; Command-Return presses the default button', () => {
  const area = { role: 'AXTextArea', name: null, defaultButton: { role: 'AXButton', name: 'Send', panel: null } }
  assert.equal(decide({ type: 'type', text: 'line one\nline two' }, area).decision, 'allow', 'lines typed into a compose body')
  assert.equal(decide({ type: 'keypress', keys: ['ENTER'] }, area).decision, 'allow', 'Return in the area')
  assert.deepEqual([decide({ type: 'keypress', keys: ['META', 'ENTER'] }, area).decision, decide({ type: 'keypress', keys: ['META', 'ENTER'] }, area).class], ['confirm', 'submit'], 'Command-Return sends')
  assert.equal(decide({ type: 'type', text: 'x\n' }, { role: 'AXTextArea', name: 'Reply', defaultButton: null }).class, 'submit', 'the area\'s own name still applies')
})

test('a Return pressing an unnamed default button is marked defaultButtonUnnamed, not asked (cu-developer-two)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-default-'))
  try {
    const FIXTURE = 'ai.reflection.cu.fixture'
    const run = async (focused, keys) => {
      const control = createRunControl()
      const environment = createFakeEnvironment({ kind: 'desktop', control })
      environment.focusedElement = async () => ({ origin: FIXTURE, fingerprint: 'f', ...focused })
      const store = createAppApprovals({ path: join(dir, `a-${Math.random()}.json`) })
      store.grantAlways(FIXTURE, { by: 'api' })
      const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [{ type: 'keypress', keys }] }, { final: 'done' }] })
      const result = await runTask({ task: 'fill it', environment, model, control, runsDirectory: join(dir, `runs-${Math.random()}`), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
      return readRun(result.trajectoryDir).events.find((e) => e.kind === 'action' && e.action?.type === 'keypress')
    }
    const unnamed = { role: 'AXButton', name: null, panel: null }
    const blind = await run({ role: 'AXTextField', name: null, defaultButton: unnamed }, ['ENTER'])
    assert.deepEqual([blind.decision, blind.defaultButtonUnnamed], ['allow', true])
    assert.equal((await run({ role: 'AXTextArea', name: null, defaultButton: unnamed }, ['ENTER'])).defaultButtonUnnamed, undefined, 'a Return in a text area is text')
    assert.equal((await run({ role: 'AXTextArea', name: null, defaultButton: unnamed }, ['META', 'ENTER'])).defaultButtonUnnamed, true, 'Command-Return there presses it')
    assert.equal((await run({ role: 'AXTextField', name: null, defaultButton: { role: 'AXButton', name: 'OK', panel: null } }, ['ENTER'])).defaultButtonUnnamed, undefined, 'a named default is judged, not marked')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
