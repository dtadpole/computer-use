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

// CU-186 (paste-consent.md): a menu paste is judged at the focused field it lands in, not at the menu item.
const FIXTURE = 'ai.reflection.cu.fixture'
const COPY = { type: 'keypress', keys: ['META', 'C'] }
const MENU_CLICK = { type: 'click', x: 10, y: 10, button: 'left' }
const isCopy = (a) => a.type === 'keypress' && a.keys.includes('META') && a.keys.includes('C')

async function run(pasteAction, { focused, menu = true, item = { role: 'AXMenuItem', name: 'Paste' }, full = false, sideRead = false }) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-186-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control })
    const count = () => 41 + environment.log.filter(isCopy).length
    environment.focusedElement = async () => {
      if (environment.log.length === 0) return { origin: FIXTURE, role: 'AXTextField', name: 'Notes', editable: true, fingerprint: 'n', pasteboardChangeCount: count() }
      return focused === null ? null : { origin: FIXTURE, fingerprint: 'f', pasteboardChangeCount: count(), ...focused }
    }
    if (menu) environment.inspectPoint = async () => ({ origin: FIXTURE, fingerprint: 'p', pasteboardChangeCount: count(), ...item })
    // CU-219: the macOS driver's count read beside a null focused target.
    if (sideRead) environment.pasteboardChangeCount = async () => count()
    const store = createAppApprovals({ path: join(dir, 'a.json') }); store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [COPY, pasteAction] }, { final: 'done' }] })
    const result = await runTask({ task: 'fill', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 't', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const e = readRun(result.trajectoryDir).events.filter((x) => x.kind === 'action').pop()
    return full ? e : [e.decision, e.class ?? e.rule]
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
const entry = (name, extra = {}) => ({ role: 'AXTextField', name, editable: true, ...extra })

test('CU-186: Edit > Paste into a field named IBAN asks sensitive_data, as Command-V does; into Notes it is allowed', async () => {
  assert.deepEqual(await run(MENU_CLICK, { focused: entry('IBAN') }), ['confirm', 'sensitive_data'])
  assert.deepEqual(await run({ type: 'keypress', keys: ['META', 'V'] }, { focused: entry('IBAN'), menu: false }), ['confirm', 'sensitive_data'], 'Command-V unchanged')
  assert.deepEqual(await run(MENU_CLICK, { focused: entry('Notes') }), ['allow', 'default'])
})

test('CU-186: Edit > Paste into a password or secure field is handed to the person', async () => {
  assert.deepEqual(await run(MENU_CLICK, { focused: entry('Password') }), ['handoff', 'password_field'])
  assert.deepEqual(await run(MENU_CLICK, { focused: entry('Code', { secure: true }) }), ['handoff', 'secure_field'])
})

test('CU-186: a focus read that lands on a menu, or that could not be read, leaves the field unknown - the paste asks', async () => {
  assert.deepEqual(await run(MENU_CLICK, { focused: { role: 'AXMenuItem', name: 'Paste' } }), ['confirm', 'sensitive_data'])
  assert.deepEqual(await run(MENU_CLICK, { focused: null }), ['confirm', 'sensitive_data'])
  assert.deepEqual(await run(MENU_CLICK, { focused: { role: null, name: null, noFocus: true } }), ['confirm', 'sensitive_data'], "the driver's no-focus placeholder")
  assert.deepEqual(await run(MENU_CLICK, { focused: { role: null, name: null, noFocus: true, sheet: true } }), ['confirm', 'sensitive_data'], 'the placeholder with a sheet up')
})

test('CU-186: a keystroke paste with no focused element is not the menu\'s unknown-destination rule - it is judged on the count the driver reads beside the null target (CU-219); with no count at all (CU-220) it asks', async () => {
  const e = await run({ type: 'keypress', keys: ['META', 'V'] }, { focused: null, menu: false, full: true, sideRead: true })
  assert.deepEqual([e.decision, e.class ?? e.rule], ['allow', 'default'], 'own copy, Command-V, nothing focused: the count rose by exactly that copy')
  assert.deepEqual([e.pasteboard?.own, e.pasteboard?.count, e.pasteboard?.by, e.pasteboard?.countRead], [true, 42, 'count', 'no-focus'])
  const blind = await run({ type: 'keypress', keys: ['META', 'V'] }, { focused: null, menu: false, full: true })
  assert.deepEqual([blind.decision, blind.class], ['confirm', 'sensitive_data'], 'an environment with no side read: no count')
  // Why it asks: the pasteboard is the owner's (no count to prove the own copy) - not an unknown destination, which only a menu paste has.
  assert.deepEqual([blind.pasteboard?.own, blind.pasteboard?.count], [false, null])
})

test('CU-192: a toolbar Paste button takes the same path - judged at the focused field it lands in', async () => {
  const TOOLBAR = { role: 'AXButton', subrole: 'AXToolbarButton', name: 'Paste' }
  assert.deepEqual(await run(MENU_CLICK, { focused: entry('IBAN'), item: TOOLBAR }), ['confirm', 'sensitive_data'], 'own copy, IBAN focused')
  assert.deepEqual(await run(MENU_CLICK, { focused: entry('Password'), item: TOOLBAR }), ['handoff', 'password_field'])
  assert.deepEqual(await run(MENU_CLICK, { focused: entry('Notes'), item: TOOLBAR }), ['allow', 'default'])
  // Discriminating: with IBAN focused, a pop-up's AXMenuButton taken for a paste would ask; as a plain click it is allowed.
  assert.deepEqual(await run(MENU_CLICK, { focused: entry('IBAN'), item: { role: 'AXMenuButton', name: 'Paste' } }), ['allow', 'default'], "a pop-up's own button is no paste")
})
