import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-196 (copy-source.md): a desktop Edit > Copy clicks a menu item, so the copy's source is the field focused beside it;
// a menu, role-less or unreadable focus leaves it unknown and the paste of that copy asks (fails closed).
const FIXTURE = 'ai.reflection.cu.fixture'
const MENU_COPY = { type: 'click', x: 10, y: 10, button: 'left' }
const CMD_C = { type: 'keypress', keys: ['META', 'C'] }
const CMD_V = { type: 'keypress', keys: ['META', 'V'] }
const UNNAMED = { origin: FIXTURE, role: 'AXTextField', name: '', editable: true, fingerprint: 'u' }

async function run(copyAction, copyFocus, item = { role: 'AXMenuItem', name: 'Copy' }) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-196-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control })
    const count = () => 41 + environment.log.length
    // Before the copy runs the focus is the copy's field (or a menu, or nothing); after it, the unnamed paste target.
    environment.focusedElement = async () => {
      if (environment.log.length === 0) return copyFocus === null ? null : { origin: FIXTURE, fingerprint: 'c', pasteboardChangeCount: count(), ...copyFocus }
      return { ...UNNAMED, pasteboardChangeCount: count() }
    }
    environment.inspectPoint = async () => ({ origin: FIXTURE, fingerprint: 'm', pasteboardChangeCount: count(), ...item })
    const store = createAppApprovals({ path: join(dir, 'a.json') }); store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [copyAction, CMD_V] }, { final: 'done' }] })
    const result = await runTask({ task: 'fill', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 't', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const e = readRun(result.trajectoryDir).events.filter((x) => x.kind === 'action').pop()
    return [e.decision, e.class ?? e.rule]
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
const entry = (name) => ({ role: 'AXTextField', name, editable: true })

test('CU-196 routes: Edit > Copy from a field named IBAN carries its class - the paste into an unnamed entry asks', async () => {
  assert.deepEqual(await run(MENU_COPY, entry('IBAN')), ['confirm', 'sensitive_data'])
  assert.deepEqual(await run(MENU_COPY, entry('Notes')), ['allow', 'default'], 'a neutral field carries nothing')
})

test('CU-196: a menu copy whose focus is a menu, role-less or unreadable leaves the source unknown - the paste asks, never passes as harmless', async () => {
  assert.deepEqual(await run(MENU_COPY, { role: 'AXMenuItem', name: 'Copy' }), ['confirm', 'sensitive_data'], 'focus on the menu')
  assert.deepEqual(await run(MENU_COPY, { role: null, name: null, noFocus: true }), ['confirm', 'sensitive_data'], 'the no-focus placeholder')
  assert.deepEqual(await run(MENU_COPY, null), ['confirm', 'sensitive_data'], 'the focus could not be read')
})

test('CU-196: a keystroke copy is unchanged - Command-C from Notes pastes unasked', async () => {
  assert.deepEqual(await run(CMD_C, entry('Notes')), ['allow', 'default'])
})

test('CU-196 routes: a context-menu Copy (no key equivalent) and an Edit > Cut take the same path', async () => {
  // cu-researcher's red team: a right-click menu's Copy and a menu Cut reach menuCopy too; each turns only on the source.
  assert.deepEqual(await run(MENU_COPY, entry('IBAN'), { role: 'AXMenuItem', name: 'Copy' }), ['confirm', 'sensitive_data'], 'context-menu Copy')
  assert.deepEqual(await run(MENU_COPY, entry('IBAN'), { role: 'AXMenuItem', name: 'Cut', keyEquivalent: { char: 'X', modifiers: 0 } }), ['confirm', 'sensitive_data'], 'Edit > Cut')
  assert.deepEqual(await run(MENU_COPY, entry('Notes'), { role: 'AXMenuItem', name: 'Cut', keyEquivalent: { char: 'X', modifiers: 0 } }), ['allow', 'default'], 'a Cut from Notes carries nothing')
})
