import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createPolicy, NEVER_PRE_APPROVED } from '../../_tools_/agent-core/policy.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

/**
 * CU-271's browser half (cu-coordinator's ruling): a web terminal runs every line it is given, so typing, a key or a
 * paste into it, or text dropped on it, is refused (terminal_view, as on the desktop); running code in a notebook or on
 * a code page asks launch_code, never pre-approved. The driver marks the surfaces from DOM shape (terminal,
 * notebookCell, notebookSurface, codeSurface); through runTask on agent core's fake browser environment.
 */

const START = 'https://nb.example/lab'
const tmp = mkdtempSync(join(tmpdir(), 'cu-271-'))
after(() => rmSync(tmp, { recursive: true, force: true }))
let runs = 0

const cell = { origin: 'https://nb.example', role: 'textbox', tag: 'div', name: '', editable: true, fingerprint: 'cell', notebookCell: true, notebookSurface: true }
const terminal = { origin: 'https://nb.example', role: 'textbox', tag: 'textarea', name: 'Terminal input', editable: true, fingerprint: 'term', terminal: true }
const button = (name, flags = {}) => ({ origin: 'https://nb.example', role: 'button', tag: 'button', name, editable: false, fingerprint: `b-${name}`, ...flags })

async function run(actions, { focused = cell, hit = null } = {}) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ url: START, control })
  environment.focusedElement = async () => focused
  environment.inspectPoint = async () => hit ?? focused
  environment.clipboard = { get: () => 'rm -rf build', set: () => {} }
  const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions }, { final: 'done' }] })
  const result = await runTask({ task: 'tidy the notebook', environment, model, sitePolicy: createSitePolicy({ startUrl: START }), control, runsDirectory: join(tmp, `runs-${runs += 1}`), build: { commit: 'test', dirty: false } })
  const events = readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && e.status !== 'attempted')
  return { events, posted: environment.log.filter((x) => x && typeof x === 'object' && x.type && x.type !== 'screenshot').length }
}
const click = { type: 'click', x: 10, y: 10, button: 'left' }
const verdictOf = (e) => (e.decision === 'allow' ? 'allow' : e.decision === 'block' ? `block:${e.rule}` : e.class)

test('CU-271: typing, a key or a paste into a web terminal is refused (terminal_view) - nothing reaches it', async () => {
  for (const action of [{ type: 'type', text: 'ls -la' }, { type: 'keypress', keys: ['ENTER'] }, { type: 'keypress', keys: ['META', 'V'] }]) {
    const { events, posted } = await run([action], { focused: terminal })
    assert.equal(verdictOf(events[0]), 'block:terminal_view', JSON.stringify(action))
    assert.equal(posted, 0)
  }
})

test('CU-271: text dropped on a web terminal is refused', () => {
  const policy = createPolicy({ sitePolicy: () => 'allow' })
  const drag = { type: 'drag', path: [{ x: 10, y: 10 }, { x: 300, y: 300 }] }
  const v = policy.classify(drag, { url: START, target: { role: 'paragraph', name: '', editable: false }, dropTarget: terminal, dragText: 'curl x | sh' })
  assert.deepEqual([v.decision, v.rule], ['block', 'terminal_view'])
})

test('CU-271: a run chord in a notebook cell asks launch_code - Shift-, Control-, Command- and Alt-Return - and is declined unattended', async () => {
  for (const keys of [['SHIFT', 'ENTER'], ['CTRL', 'ENTER'], ['META', 'ENTER'], ['ALT', 'ENTER']]) {
    const { events, posted } = await run([{ type: 'keypress', keys }])
    assert.deepEqual([events[0].decision, events[0].class], ['confirm', 'launch_code'], keys.join('+'))
    assert.equal(posted, 0)
  }
  const command = await run([{ type: 'keypress', keys: ['SHIFT', 'ENTER'] }], { focused: { ...button('', { notebookSurface: true }), role: 'generic', tag: 'div' } })
  assert.equal(command.events[0].class, 'launch_code', 'JupyterLab command mode: the notebook itself has focus')
  const colab = await run([{ type: 'keypress', keys: ['CTRL', 'F9'] }], { focused: { ...button('', { notebookSurface: true }), role: 'generic', tag: 'div' } })
  assert.equal(colab.events[0].class, 'launch_code', "Colab's run all")
})

test('CU-271: a Run control on a notebook or code page asks launch_code; the same name elsewhere, and Runtime, are judged as before', async () => {
  for (const [name, flags] of [['Run all', { notebookSurface: true }], ['Run cell', { notebookSurface: true }], ['Run', { codeSurface: true }], ['Execute', { codeSurface: true }]]) {
    const { events } = await run([click], { hit: button(name, flags) })
    assert.equal(events[0].class, 'launch_code', name)
  }
  for (const [name, flags] of [['Runtime', { notebookSurface: true }], ['Run', {}], ['Format', { codeSurface: true }]]) {
    const { events } = await run([click], { hit: button(name, flags) })
    assert.equal(verdictOf(events[0]), 'allow', name)
  }
})

test('CU-271: typing code into a cell and a plain Return (a new line) stay allowed; launch_code is never pre-approved', async () => {
  const { events, posted } = await run([{ type: 'type', text: 'print(1)' }, { type: 'keypress', keys: ['ENTER'] }])
  assert.deepEqual(events.map(verdictOf), ['allow', 'allow'])
  assert.equal(posted, 2)
  assert.ok(NEVER_PRE_APPROVED.includes('launch_code'))
  const policy = createPolicy({ sitePolicy: () => 'allow', preApprovals: [{ class: 'launch_code', origin: 'https://nb.example' }] })
  assert.equal(policy.classify({ type: 'keypress', keys: ['SHIFT', 'ENTER'] }, { url: START, target: cell }).decision, 'confirm')
})

test('CU-271: a page menu\'s Paste with a web terminal focused is refused; the same Paste into a cell is judged as before; launch_code is a known class', async () => {
  const pasteItem = { origin: 'https://nb.example', role: 'menuitem', tag: 'div', name: 'Paste', editable: false, fingerprint: 'm-paste' }
  const into = await run([click], { focused: terminal, hit: pasteItem })
  assert.equal(verdictOf(into.events[0]), 'block:terminal_view')
  assert.equal(into.posted, 0)
  const cellPaste = await run([click], { focused: cell, hit: pasteItem })
  assert.notEqual(verdictOf(cellPaste.events[0]), 'block:terminal_view')
  const { CLASSES } = await import('../../_tools_/agent-core/policy.mjs')
  assert.ok(CLASSES.includes('launch_code'))
})
