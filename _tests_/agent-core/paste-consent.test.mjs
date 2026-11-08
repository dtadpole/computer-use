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
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'
import { CARD, IBAN_GB } from '../fixture-shapes/shapes.mjs'

// CU-151 (paste-consent.md): a paste is judged by what it inserts. Desktop: the owner's pasteboard (unread) unless the
// run's own copy put it there, proven by changeCount; browser: the run's clipboard text, judged as typed text.

const FIXTURE = 'ai.reflection.cu.fixture'
const copies = (log) => log.filter((a) => a.type === 'keypress' && a.keys.includes('META') && (a.keys.includes('C') || a.keys.includes('X'))).length
const frame = { width: 1440, height: 900 }

async function desktop(actions, count, { menu = false, item = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-paste-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control })
    const withCount = (fields) => { const c = count(environment.log); return { origin: FIXTURE, ...fields, ...(c === undefined ? {} : { pasteboardChangeCount: c }) } }
    environment.focusedElement = async () => withCount({ role: 'AXTextField', name: 'Message', fingerprint: 'm' })
    if (menu) environment.inspectPoint = async () => withCount(item ?? { role: 'AXMenuItem', name: 'Paste', fingerprint: 'p' })
    const store = createAppApprovals({ path: join(dir, 'a.json') })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame, turns: [{ actions }, { final: 'done' }] })
    const result = await runTask({ task: 'reply', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const events = [...new Map(readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').map((e) => [`${e.step}:${e.index}`, e])).values()]
    return Object.assign(events[events.length - 1], { all: events })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const COPY = { type: 'keypress', keys: ['META', 'C'] }
const PASTE = { type: 'keypress', keys: ['META', 'V'] }

test('desktop: a paste with no copy of the run\'s own before it asks - the owner\'s pasteboard', async () => {
  const paste = await desktop([PASTE], () => 41)
  assert.deepEqual([paste.decision, paste.class], ['confirm', 'sensitive_data'])
})

test('desktop: Command-C then Command-V in one batch is allowed when the count rose by the run\'s copy', async () => {
  const paste = await desktop([COPY, PASTE], (log) => 41 + copies(log))
  assert.equal(paste.decision, 'allow')
})

test('desktop: a copy that raised nothing (nothing selected, or a write still pending), or a rise the run did not make, asks', async () => {
  assert.equal((await desktop([COPY, PASTE], () => 41)).class, 'sensitive_data', 'no rise')
  assert.equal((await desktop([COPY, PASTE], (log) => 41 + 2 * copies(log))).class, 'sensitive_data', 'another write too')
})

test('desktop with an older helper (no count): the action history decides - an own copy before allows, none asks', async () => {
  assert.equal((await desktop([COPY, PASTE], () => undefined)).decision, 'allow')
  assert.equal((await desktop([PASTE], () => undefined)).class, 'sensitive_data')
})

test('desktop: the Edit menu\'s Paste counts the same', async () => {
  const paste = await desktop([{ type: 'click', x: 10, y: 10, button: 'left' }], () => 41, { menu: true })
  assert.deepEqual([paste.decision, paste.class], ['confirm', 'sensitive_data'])
})

async function browser(clip) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-paste-b-'))
  try {
    const START = 'http://127.0.0.1:43117/tasks/demo/'
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: START, control })
    environment.clipboard = { get: () => clip }
    environment.focusedElement = async () => ({ tag: 'textarea', role: 'textbox', name: 'Comments', origin: 'http://127.0.0.1:43117', fingerprint: 'c' })
    const model = createScriptedAdapter({ frame, turns: [{ actions: [{ type: 'keypress', keys: ['CTRL', 'V'] }] }, { final: 'done' }] })
    const result = await runTask({ task: 'leave a comment', environment, model, sitePolicy: createSitePolicy({ startUrl: START }), control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false } })
    return readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').pop()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('browser: the run\'s clipboard text is judged as typed text - a card number asks, plain text does not', async () => {
  assert.deepEqual([(await browser(CARD)).decision, (await browser(CARD)).class], ['confirm', 'sensitive_data'])
  assert.equal((await browser('see you at noon')).decision, 'allow')
})

async function acrossTurns({ takeOver }) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-paste-t-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control })
    environment.focusedElement = async () => ({ origin: FIXTURE, role: 'AXTextField', name: 'Message', fingerprint: 'm' })
    const store = createAppApprovals({ path: join(dir, 'a.json') })
    store.grantAlways(FIXTURE, { by: 'api' })
    const scripted = createScriptedAdapter({ frame, turns: [{ actions: [COPY] }, { actions: [PASTE] }, { final: 'done' }] })
    let turn = 0
    const model = { ...scripted, async open(options) {
      const session = await scripted.open(options)
      return { ...session, next: (input, o) => {
        turn += 1
        // Between the copy's turn and the paste's, the person takes over (and may copy) and hands back.
        if (takeOver && turn === 2) { control.send('take_over', { source: 'control' }); control.send('hand_back', { source: 'control' }) }
        return session.next(input, o)
      } }
    } }
    const result = await runTask({ task: 'reply', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    return readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && e.action?.keys?.includes('V')).pop()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('desktop: a take-over between the copy and the paste resets the run\'s own copy - the paste asks', async () => {
  assert.equal((await acrossTurns({ takeOver: false })).decision, 'allow', 'the copy, then the paste a turn later')
  assert.equal((await acrossTurns({ takeOver: true })).class, 'sensitive_data', 'the person had the Mac in between')
})

test('a copy\'s and a paste\'s events record what they were judged on - the counts and the verdict, never content', async () => {
  const paste = await desktop([COPY, PASTE], (log) => 41 + copies(log))
  const [copy] = paste.all
  assert.deepEqual(copy.pasteboard, { kind: 'copy', count: 41 })
  assert.deepEqual(paste.pasteboard, { kind: 'paste', count: 42, baseline: 41, copies: 1, own: true, by: 'count' })
  const owner = await desktop([PASTE], () => 41)
  assert.deepEqual(owner.pasteboard, { kind: 'paste', count: 41, baseline: null, copies: 0, own: false, by: 'history' })
  const older = await desktop([COPY, PASTE], () => undefined)
  assert.deepEqual(older.pasteboard, { kind: 'paste', count: null, baseline: null, copies: 1, own: true, by: 'history' })
  const web = await browser(CARD)
  assert.deepEqual(web.pasteboard, { kind: 'paste', by: 'run-clipboard' })
  assert.ok(!JSON.stringify(web).includes('4111'), 'the pasted text is never recorded')
})

// CU-154: the menu item's key equivalent names it in any language; the English name is the fallback.
const CLICK = { type: 'click', x: 10, y: 10, button: 'left' }
const menuItem = (name, keyEquivalent) => ({ role: 'AXMenuItem', name, fingerprint: name, ...(keyEquivalent ? { keyEquivalent } : {}) })

test('a localised Edit menu item is known by its key equivalent: Coller (Command-V) with no own copy asks', async () => {
  const paste = await desktop([CLICK], () => 41, { menu: true, item: menuItem('Coller', { char: 'v', modifiers: 0 }) })
  assert.deepEqual([paste.decision, paste.class], ['confirm', 'sensitive_data'])
  const matchStyle = await desktop([CLICK], () => 41, { menu: true, item: menuItem('Coller et adapter le style', { char: 'V', modifiers: 3 }) })
  assert.equal(matchStyle.class, 'sensitive_data', 'Option-Shift-Command-V is a paste too')
})

test('a key equivalent that is not the paste chord is not a paste, whatever the title; no key equivalent falls back to the name', async () => {
  assert.equal((await desktop([CLICK], () => 41, { menu: true, item: menuItem('Paste', { char: 'V', modifiers: 4 }) })).decision, 'allow', 'Control-Command-V')
  assert.equal((await desktop([CLICK], () => 41, { menu: true, item: menuItem('Einsetzen', { char: 'V', modifiers: 8 }) })).decision, 'allow', 'V without Command')
  assert.equal((await desktop([CLICK], () => 41, { menu: true, item: menuItem('Paste', null) })).class, 'sensitive_data', 'an older helper: the English name')
  assert.equal((await desktop([CLICK], () => 41, { menu: true, item: menuItem('Coller', null) })).decision, 'allow', 'no key equivalent and a foreign name: the named limit')
})

test('Copier then Coller from a localised Edit menu, the count risen by that copy: allowed (the copy side counts too)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cu-paste-menu-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control })
    const copied = () => environment.log.filter((a) => a.type === 'click' && a.x === 10).length
    const at = (fields) => ({ origin: FIXTURE, ...fields, pasteboardChangeCount: 41 + copied() })
    environment.inspectPoint = async ({ x }) => at(x === 10 ? menuItem('Copier', { char: 'C', modifiers: 0 }) : menuItem('Coller', { char: 'V', modifiers: 0 }))
    environment.focusedElement = async () => at({ role: 'AXTextField', name: 'Message', fingerprint: 'm' })
    const store = createAppApprovals({ path: join(dir, 'a.json') })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame, turns: [{ actions: [{ ...CLICK, x: 10 }, { ...CLICK, x: 20 }] }, { final: 'done' }] })
    const result = await runTask({ task: 'reply', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    // A performed action logs two events; one per step and index.
    const clicks = [...new Map(readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action' && e.action?.type === 'click').map((e) => [`${e.step}:${e.index}`, e])).values()]
    assert.deepEqual(clicks.map((e) => e.decision), ['allow', 'allow'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CU-179: a paste goes through the same name and value rules as typing - in a browser and for a desktop own copy', async () => {
  const { createPolicy } = await import('../../_tools_/agent-core/policy.mjs')
  const { createSitePolicy } = await import('../../_tools_/agent-core/sites.mjs')
  const policy = createPolicy({ sitePolicy: createSitePolicy({ startUrl: 'https://form.example/x' }) })
  const web = (name) => ({ tag: 'input', role: 'textbox', name, editable: true, origin: 'https://form.example', fingerprint: 'f' })
  const judge = (action, target, extra = {}) => { const v = policy.classify(action, { url: 'https://form.example/x', task: 'fill it', target, ...extra }); return v.decision === 'allow' ? 'allow' : v.class }
  const pasteWeb = (name, text) => judge({ type: 'keypress', keys: ['META', 'V'] }, web(name), { paste: { text } })
  const typeWeb = (name, text) => judge({ type: 'type', text }, web(name))
  for (const [name, cls] of [['IBAN', 'sensitive_data'], ['Password', 'credential'], ['Recovery phrase', 'sensitive_data'], ['Passport', 'sensitive_data'], ["Driver's licence", 'sensitive_data'], ['Notes', 'allow']]) {
    assert.equal(pasteWeb(name, 'abc123xyz'), cls, `browser paste into ${name}`)
    assert.equal(pasteWeb(name, 'abc123xyz'), typeWeb(name, 'abc123xyz'), `paste and type agree on ${name}`)
  }
  assert.equal(pasteWeb('Notes', IBAN_GB), 'sensitive_data', 'the value rules still apply to a pasted IBAN')
  const desk = (name) => ({ role: 'AXTextField', name, editable: true, origin: 'com.example.app', fingerprint: 'f' })
  // Desktop runs judge with an inner policy whose site filter always allows (createAppPolicy); the app scope is checked first.
  const deskPolicy = createPolicy({ sitePolicy: () => 'allow' })
  const pasteDesk = (name, fromOwner) => { const v = deskPolicy.classify({ type: 'keypress', keys: ['CMD', 'V'] }, { url: '', task: 'fill it', target: desk(name), paste: { fromOwner } }); return v.decision === 'allow' ? 'allow' : v.class }
  for (const [name, cls] of [['IBAN', 'sensitive_data'], ['Password', 'credential'], ['Tax ID', 'sensitive_data'], ['Notes', 'allow']]) {
    assert.equal(pasteDesk(name, false), cls, `desktop own-copy paste into ${name} (no text read)`)
  }
  assert.equal(pasteDesk('Notes', true), 'sensitive_data', "the owner's own pasteboard still asks anywhere (CU-151)")
})
