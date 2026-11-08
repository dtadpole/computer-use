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
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-183 (copy-source.md): a copy carries its source field's class to the paste; a drag its press entry's to the drop.
const FIXTURE = 'ai.reflection.cu.fixture'
const frame = { width: 1440, height: 900 }
const COPY = { type: 'keypress', keys: ['META', 'C'] }
const PASTE = { type: 'keypress', keys: ['META', 'V'] }
const isCopy = (a) => a.type === 'keypress' && a.keys.includes('META') && a.keys.includes('C')
const verdict = (v) => (v.decision === 'allow' ? 'allow' : v.class)

const deskPolicy = createPolicy({ sitePolicy: () => 'allow' })
const drag = (target, dropTarget) => verdict(deskPolicy.classify({ type: 'drag', path: [{ x: 1, y: 1 }, { x: 50, y: 50 }] }, { url: '', task: 't', target, dropTarget }))

test('CU-183: a drag pressed on a sensitive entry carries its class to any drop off it; a reorder inside it does not', () => {
  const iban = { role: 'AXTextField', name: 'IBAN', editable: true }
  assert.equal(drag(iban, { role: 'AXGroup', name: '' }), 'sensitive_data', 'a role-less drop zone')
  assert.equal(drag(iban, null), 'sensitive_data', 'a drop point nothing could inspect')
  assert.equal(drag(iban, { role: 'AXTextField', name: 'IBAN', editable: true }), 'allow', 'back inside the same entry')
  assert.equal(drag({ ...iban, fingerprint: 'a' }, { role: 'AXTextField', name: 'IBAN', fingerprint: 'b' }), 'sensitive_data', 'another entry of the same name')
  assert.equal(drag({ role: 'AXTextField', name: 'Notes', editable: true }, { role: 'AXGroup', name: '' }), 'allow', 'a neutral entry carries nothing')
  const press = verdict(deskPolicy.classify({ type: 'drag', path: [{ x: 5, y: 5 }, { x: 5, y: 5 }] }, { url: '', task: 't', target: iban, dropTarget: { role: 'AXGroup', name: '' } }))
  assert.equal(press, 'allow', 'a press that does not travel moves no text')
})

test('CU-183: with no desktop count, every source since the last proven count is passed and the strongest wins', () => {
  const paste = { fromOwner: false, source: [{ role: 'AXTextField', name: 'Notes' }, { role: 'AXTextField', name: 'Password' }] }
  assert.equal(verdict(deskPolicy.classify(PASTE, { url: '', task: 't', target: { role: 'AXTextField', name: '', editable: true }, paste })), 'credential')
})

// Desktop runs: the focused field is the copy's source before the first paste-side step, an unnamed entry after.
async function desktopRun(actions, { sources, count, menuPaste = false }) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-copysrc-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control })
    const withCount = (fields) => { const c = count(environment.log); return { origin: FIXTURE, ...fields, ...(c === undefined ? {} : { pasteboardChangeCount: c }) } }
    environment.focusedElement = async () => {
      const done = environment.log.length
      const name = done < sources.length ? sources[done] : ''
      return withCount({ role: 'AXTextField', name, editable: true, fingerprint: `f${done}` })
    }
    if (menuPaste) environment.inspectPoint = async () => withCount({ role: 'AXMenuItem', name: 'Paste', fingerprint: 'p' })
    const store = createAppApprovals({ path: join(dir, 'a.json') })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame, turns: [{ actions }, { final: 'done' }] })
    const result = await runTask({ task: 'fill', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store, preApprovals: [{ class: 'sensitive_data' }] })
    const events = [...new Map(readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').map((e) => [`${e.step}:${e.index}`, e])).values()]
    return events[events.length - 1]
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
const rising = (log) => 41 + log.filter(isCopy).length

test('CU-183 desktop: an own copy from IBAN, proven by the count, carries sensitive_data to a paste into an unnamed entry', async () => {
  const paste = await desktopRun([COPY, PASTE], { sources: ['IBAN'], count: rising })
  assert.equal(paste.class, 'sensitive_data')
  assert.equal(paste.pasteboard?.own, true, 'judged as the run\'s own copy, not the owner\'s board')
})

test('CU-183 desktop: a newer copy from Notes clears the class; Edit > Paste carries it like Command-V', async () => {
  assert.equal((await desktopRun([COPY, COPY, PASTE], { sources: ['IBAN', 'Notes'], count: rising })).decision, 'allow')
  const menu = await desktopRun([COPY, { type: 'click', x: 10, y: 10, button: 'left' }], { sources: ['IBAN'], count: rising, menuPaste: true })
  assert.equal(menu.class, 'sensitive_data')
})

test('CU-183 desktop: a copy that wrote nothing breaks the proof - the paste is the owner\'s and asks anyway', async () => {
  const paste = await desktopRun([COPY, COPY, PASTE], { sources: ['IBAN', 'Notes'], count: (log) => 41 + Math.min(1, log.filter(isCopy).length) })
  assert.equal(paste.class, 'sensitive_data')
  assert.equal(paste.pasteboard?.own, false)
})

// Browser runs: the run buffer is written by a copy only when `writes` says so for that copy.
async function browserRun(actions, { sources, writes }) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-copysrc-b-'))
  try {
    const START = 'http://127.0.0.1:43117/tasks/demo/'
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: START, control })
    let clip = ''
    let copies = 0
    environment.clipboard = { get: () => clip }
    const perform = environment.perform.bind(environment)
    environment.perform = async (action) => {
      const effect = await perform(action)
      if (isCopy(action)) { if (writes[copies]) clip = writes[copies]; copies += 1 }
      return effect
    }
    environment.focusedElement = async () => {
      const done = environment.log.length
      return { tag: 'input', role: 'textbox', name: done < sources.length ? sources[done] : '', editable: true, origin: 'http://127.0.0.1:43117', fingerprint: `f${done}` }
    }
    const model = createScriptedAdapter({ frame, turns: [{ actions }, { final: 'done' }] })
    const result = await runTask({ task: 'fill', environment, model, sitePolicy: createSitePolicy({ startUrl: START }), control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, preApprovals: [{ class: 'sensitive_data' }] })
    return readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').pop()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('CU-183 browser: a copy from Passport that wrote the run buffer carries sensitive_data to a paste into an unnamed entry', async () => {
  assert.equal((await browserRun([COPY, PASTE], { sources: ['Passport'], writes: ['X1234567'] })).class, 'sensitive_data')
})

test('CU-183 browser: an empty copy keeps the carried class; a newer copy from Notes that wrote clears it', async () => {
  assert.equal((await browserRun([COPY, COPY, PASTE], { sources: ['Passport', 'Notes'], writes: ['X1234567', null] })).class, 'sensitive_data', 'the empty copy did not clear it')
  assert.equal((await browserRun([COPY, COPY, PASTE], { sources: ['Passport', 'Notes'], writes: ['X1234567', 'see you at noon'] })).decision, 'allow')
})

// CU-223 (red team of CU-209): since helper 0.2.51 a read-only text view (AXTextArea whose value cannot be set) is
// captioned like shown text, so a COPY out of it - Command-C or Edit > Copy - carries the caption's class to a paste into
// an unnamed entry, as its drag does. Before 0.2.51 it was an uncaptioned entry and the paste ran unasked. No
// pre-approval: the paste must ask. `selection` models the helper's selectionSource reply (role and caption only).
const MENU_COPY = { type: 'click', x: 10, y: 10, button: 'left' }
async function readonlyViewCopy(caption, { copy = COPY, selection = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-copysrc-ro-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control })
    const copies = () => environment.log.filter((a) => isCopy(a) || a.type === 'click').length
    const withCount = (fields) => ({ origin: FIXTURE, ...fields, pasteboardChangeCount: 41 + copies() })
    environment.focusedElement = async () => withCount(copies() === 0
      ? { role: 'AXTextArea', name: '', caption, editable: false, fingerprint: 'v' }
      : { role: 'AXTextField', name: '', editable: true, fingerprint: 'u' })
    if (selection) environment.selectionSource = async () => (copies() === 0 ? { role: 'AXTextArea', tag: null, origin: FIXTURE, caption } : null)
    environment.inspectPoint = async () => withCount({ role: 'AXMenuItem', name: 'Copy', keyEquivalent: { char: 'C', modifiers: 0 }, fingerprint: 'c' })
    const store = createAppApprovals({ path: join(dir, 'a.json') })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame, turns: [{ actions: [copy, PASTE] }, { final: 'done' }] })
    const result = await runTask({ task: 'fill', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const events = [...new Map(readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').map((e) => [`${e.step}:${e.index}`, e])).values()]
    return events[events.length - 1]
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('CU-223 desktop: a copy from the IBAN-captioned read-only text view asks at the paste - Command-C, with or without a selection read, and Edit > Copy', async () => {
  for (const [label, options] of [['Command-C', {}], ['Command-C, no selection read', { selection: false }], ['Edit > Copy', { copy: MENU_COPY }]]) {
    const paste = await readonlyViewCopy('IBAN', options)
    assert.deepEqual([paste.decision, paste.class], ['confirm', 'sensitive_data'], label)
    assert.equal(paste.pasteboard?.own, true, `${label}: judged as the run's own copy, proven by the count`)
  }
})

test('CU-223 desktop negative: the same copy from the Notes-captioned read-only text view pastes unasked', async () => {
  assert.equal((await readonlyViewCopy('Notes')).decision, 'allow')
  assert.equal((await readonlyViewCopy('Notes', { copy: MENU_COPY })).decision, 'allow')
})
