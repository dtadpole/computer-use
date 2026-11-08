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

// CU-232 (menu-key.md): a desktop chord that is a menu item's key equivalent fires that item - AppKit offers it to the
// menu - so it is judged as a click on the item too, the stricter verdict winning: Shift-Command-D bound to Mail's Send
// asks submit. The driver reads the item (menuItemForChord: role, name, key equivalent only); a read that fails asks,
// except for the editing chords the loop already judges by their meaning, which read nothing.

const FIXTURE = 'ai.reflection.cu.fixture'
const frame = { width: 1440, height: 900 }
const key = (...keys) => ({ type: 'keypress', keys })
const BODY = { origin: FIXTURE, role: 'AXTextArea', name: 'Message body', editable: true, fingerprint: 'b', defaultButton: null, defaultButtonRead: true }
const item = (name, char, modifiers) => ({ role: 'AXMenuItem', name, keyEquivalent: { char, modifiers }, path: ['Message'] })

/**
 * One unattended desktop run of `actions`; `menu(action)` is the driver's menuItemForChord answer (or a throw), or
 * `menu: false` for an environment without the read. Returns the action events and the chords the loop asked about.
 */
async function run(actions, { menu = () => ({ none: true }) } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-232-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control })
    const asked = []
    environment.focusedElement = async () => BODY
    if (menu !== false) environment.menuItemForChord = async (action) => { asked.push(action.keys.join('+')); return menu(action) }
    const store = createAppApprovals({ path: join(dir, 'a.json') })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame, turns: [{ actions }, { final: 'done' }] })
    const result = await runTask({ task: 'write the reply', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const events = [...new Map(readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').map((e) => [`${e.step}:${e.index}`, e])).values()]
    return { events, asked }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const verdict = (e) => [e.decision, e.class ?? e.rule]

test('CU-232: Shift-Command-D bound to Send asks submit (declined unattended); the same chord with no bound item, or no read at all, is allowed', async () => {
  const send = await run([key('META', 'SHIFT', 'D')], { menu: () => item('Send', 'D', 1) })
  assert.deepEqual(verdict(send.events[0]), ['confirm', 'submit'])
  assert.deepEqual(send.events[0].boundMenuItem, { role: 'AXMenuItem', name: 'Send', keyEquivalent: { char: 'D', modifiers: 1 } }, 'the event names the item - names only, no path')
  assert.deepEqual(verdict((await run([key('META', 'SHIFT', 'D')])).events[0]), ['allow', 'default'], 'a whole read with no match')
  assert.deepEqual(verdict((await run([key('META', 'SHIFT', 'D')], { menu: false })).events[0]), ['allow', 'default'], 'an environment without the read')
})

test('CU-232: the bound item is judged by the click rules - a benign one is allowed, a delete or purchase item asks its class', async () => {
  assert.deepEqual(verdict((await run([key('META', 'SHIFT', 'K')], { menu: () => item('Clear Log', 'K', 1) })).events[0]), ['allow', 'default'], 'Clear Log')
  assert.deepEqual(verdict((await run([key('META', 'SHIFT', 'T')], { menu: () => item('Delete Conversation', 'T', 1) })).events[0]), ['confirm', 'delete'])
  assert.deepEqual(verdict((await run([key('META', 'ALT', 'T')], { menu: () => item('Move to Trash', 'T', 2) })).events[0]), ['confirm', 'delete'])
  assert.deepEqual(verdict((await run([key('CTRL', 'B')], { menu: () => item('Buy Now', 'B', 4) })).events[0]), ['confirm', 'purchase'], 'a Control chord')
  assert.deepEqual(verdict((await run([key('F5')], { menu: () => item('Send All', null, 8) })).events[0]), ['confirm', 'submit'], 'a function key')
})

test('CU-232: a menu read that fails, throws or answers nothing usable asks (unknown_target) - D-069\'s line, an absent read is no pass', async () => {
  for (const [label, menu] of [['unreadable', () => ({ unreadable: true })], ['a throw', () => { throw new Error('helper lost') }], ['null', () => null], ['an item with no name', () => ({ name: '' })]]) {
    const { events } = await run([key('META', 'SHIFT', 'D')], { menu })
    assert.deepEqual([events[0].decision, events[0].class, events[0].rule], ['confirm', 'unknown_target', 'menu:unreadable'], label)
  }
})

test('CU-232: the editing chords the loop judges by meaning read no item, so an unreadable bar never asks for them', async () => {
  const editing = [key('META', 'A'), key('META', 'C'), key('META', 'X'), key('META', 'V'), key('META', 'ALT', 'SHIFT', 'V'), key('META', 'Z'), key('META', 'SHIFT', 'Z'), key('META', 'ARROWLEFT'), key('ALT', 'SHIFT', 'ARROWRIGHT'), key('META', 'SHIFT', 'ARROWDOWN')]
  const { events, asked } = await run(editing, { menu: () => ({ unreadable: true }) })
  assert.deepEqual(asked, [], 'no read for any of them')
  assert.ok(events.every((e) => e.rule !== 'menu:unreadable' && e.boundMenuItem === undefined), 'none asked for a menu it did not read')
})

test('CU-232: typing, Shift or Option alone, and plain keys read no item; Command-Backspace stays CU-143\'s delete', async () => {
  const { events, asked } = await run([{ type: 'type', text: 'hello' }, key('SHIFT', 'A'), key('ALT', 'E'), key('ENTER'), key('META', 'BACKSPACE')], { menu: () => ({ unreadable: true }) })
  assert.deepEqual(asked, [])
  assert.deepEqual(verdict(events[4]), ['confirm', 'delete'], 'Command-Backspace judged by its keys as before')
})

test('CU-232: the keys still count - a bound item never lowers what the keys ask (Command-D on a sheet stays delete beside a benign item)', async () => {
  const sheetRun = async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cu-232-s-'))
    try {
      const control = createRunControl()
      const environment = createFakeEnvironment({ kind: 'desktop', control })
      environment.focusedElement = async () => ({ origin: FIXTURE, role: 'AXWindow', name: 'Untitled', sheet: true, defaultButtonRead: true })
      environment.menuItemForChord = async () => item('Duplicate', 'D', 0)
      const store = createAppApprovals({ path: join(dir, 'a.json') })
      store.grantAlways(FIXTURE, { by: 'api' })
      const model = createScriptedAdapter({ frame, turns: [{ actions: [key('META', 'D')] }, { final: 'done' }] })
      const result = await runTask({ task: 'close it', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
      return readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').pop()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
  assert.deepEqual(verdict(await sheetRun()), ['confirm', 'delete'])
})

test('CU-232 (cu-researcher): every matching item counts - a benign first match does not hide a consequential one; more matches than the cap read as unreadable', async () => {
  const two = await run([key('META', 'SHIFT', 'D')], { menu: () => ({ items: [item('Clear', 'D', 1), item('Send', 'D', 1)] }) })
  assert.deepEqual(verdict(two.events[0]), ['confirm', 'submit'])
  assert.deepEqual(two.events[0].boundMenuItem.items.map((i) => i.name), ['Clear', 'Send'], 'the event names both')
  const many = Array.from({ length: 9 }, (_, i) => item(`Item ${i}`, 'D', 1))
  assert.deepEqual(verdict((await run([key('META', 'SHIFT', 'D')], { menu: () => ({ items: many }) })).events[0]), ['confirm', 'unknown_target'])
  assert.deepEqual(verdict((await run([key('META', 'SHIFT', 'D')], { menu: () => ({ items: [item('Send', 'D', 1), { name: '' }] }) })).events[0]), ['confirm', 'unknown_target'], 'one nameless entry spoils the list')
})

/** A run whose focus is `focus` rather than the compose body. */
async function runFocused(actions, focus, menu) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-232-f-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control })
    const asked = []
    environment.focusedElement = async () => focus
    environment.menuItemForChord = async (action) => { asked.push(action.keys.join('+')); return menu(action) }
    const store = createAppApprovals({ path: join(dir, 'a.json') })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame, turns: [{ actions }, { final: 'done' }] })
    const result = await runTask({ task: 'tidy up', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    return { events: [...new Map(readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').map((e) => [`${e.step}:${e.index}`, e])).values()], asked }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('CU-232 (cu-researcher): a plain Delete or Escape off a text input takes the read - Mail\'s Delete is a plain Delete key equivalent; in a text input it edits text and reads nothing', async () => {
  const pane = { origin: FIXTURE, role: 'AXGroup', name: 'Preview', fingerprint: 'p', defaultButtonRead: true }
  assert.deepEqual(verdict((await runFocused([key('DELETE')], pane, () => item('Delete', null, 8))).events[0]), ['confirm', 'delete'], 'Delete bound in a preview pane')
  assert.deepEqual(verdict((await runFocused([key('ESCAPE')], pane, () => item('Discard Draft', null, 8))).events[0]), ['confirm', 'delete'], 'Escape bound to Discard Draft')
  assert.deepEqual(verdict((await runFocused([key('BACKSPACE')], null, () => item('Delete', null, 8))).events[0]), ['confirm', 'delete'], 'nothing focused')
  const inText = await runFocused([key('BACKSPACE'), key('ESCAPE')], BODY, () => item('Delete', null, 8))
  assert.deepEqual(inText.asked, [], 'a text input reads nothing for a plain Backspace or Escape')
})
