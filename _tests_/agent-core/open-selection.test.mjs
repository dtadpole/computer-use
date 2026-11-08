import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createAppPolicy, selectionRunsCode } from '../../_tools_/agent-core/app-policy.mjs'

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

test('CU-252 rule 3 (CU-259\'s selectedItems): with the selection read, only a launchable, package or extensionless item asks', () => {
  const open = (selection) => at(FINDER, key('META', 'O'), { role: 'AXOutline', name: '' }, { selection })
  for (const items of [[{ name: 'install.command', kind: 'file' }], [{ name: 'Payload.app/', kind: 'folder' }], [{ name: 'setup', kind: 'file' }],
    [{ name: 'notes.txt', kind: 'file' }, { name: 'run.sh', kind: 'file' }], [{ name: 'thing', kind: 'unknown' }], [{ name: '.profile', kind: 'file' }]]) {
    assert.deepEqual(verdict(open({ items })), ['confirm', 'launch_code', 'selection:launch_code'], JSON.stringify(items))
  }
  for (const selection of [{ items: [{ name: 'report.pdf', kind: 'file' }, { name: 'Photos', kind: 'folder' }] }, { none: true }, { items: [{ name: 'archive.tar.gz', kind: 'file' }] }]) {
    assert.equal(open(selection).decision, 'allow', JSON.stringify(selection))
  }
  for (const selection of [{ unreadable: true }, { notCollection: true }, { items: [{ name: 'a.txt', kind: 'file' }], truncated: true }, undefined]) {
    assert.equal(open(selection).class, 'launch_code', `asks: ${JSON.stringify(selection)}`)
  }
  assert.equal(verdict(at(FINDER, click, { role: 'AXMenuItem', name: 'Open' }, { selection: { items: [{ name: 'report.pdf', kind: 'file' }] } }))[0], 'allow', 'a menu Open on a document')
})

test('CU-252 rule 3 through the loop: Finder\'s selectedItems is read for Command-O on the list - a script asks, a document runs, no read asks', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { createScriptedAdapter } = await import('../../_tools_/agent-core/adapter-scripted.mjs')
  const { createAppApprovals } = await import('../../_tools_/agent-core/app-approvals.mjs')
  const { createRunControl } = await import('../../_tools_/agent-core/control.mjs')
  const { createFakeEnvironment } = await import('../../_tools_/agent-core/fake-env.mjs')
  const { runTask } = await import('../../_tools_/agent-core/loop.mjs')
  const { readRun } = await import('../../_tools_/agent-core/trajectory.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'cu-252-sel-'))
  try {
    const run = async (selectedItems) => {
      const control = createRunControl()
      const environment = createFakeEnvironment({ kind: 'desktop', control })
      environment.state = async () => ({ url: `app:${FINDER}`, frontmostBundleId: FINDER, dialog: null })
      environment.focusedElement = async () => ({ origin: FINDER, role: 'AXOutline', name: '', fingerprint: 'o' })
      if (selectedItems) environment.selectedItems = selectedItems
      const store = createAppApprovals({ path: join(dir, `a-${Math.random()}.json`) })
      store.grantAlways(FINDER, { by: 'api' })
      const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [key('META', 'O')] }, { final: 'done' }] })
      const result = await runTask({ task: 'open it', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FINDER], appApprovals: store })
      const event = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action')
      return { event, sent: environment.log.filter((x) => (x.action ?? x)?.type).length, json: JSON.stringify(readRun(result.trajectoryDir).events) }
    }
    const script = await run(async () => ({ bundleId: FINDER, items: [{ name: 'install.command', kind: 'file' }] }))
    assert.deepEqual([script.event.decision, script.event.class, script.sent], ['confirm', 'launch_code', 0])
    assert.ok(!script.json.includes('install.command'), 'no selected name in the run record')
    // cu-verifier's ask: the judged open records the read's shape, counts by kind only.
    assert.deepEqual(script.event.selectionRead, { items: 1, kinds: { file: 1 } })
    const doc = await run(async () => ({ bundleId: FINDER, items: [{ name: 'report.pdf', kind: 'file' }] }))
    assert.deepEqual([doc.event.decision, doc.sent], ['allow', 1])
    const older = await run(null)
    assert.deepEqual([older.event.decision, older.event.class, older.sent], ['confirm', 'launch_code', 0], 'a driver without the read asks')
    assert.equal(older.event.selectionRead, undefined, 'no read, no shape')
    const unread = await run(async () => null)
    assert.deepEqual(unread.event.selectionRead, { unreadable: true })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CU-252 on cu-developer-three\'s review: a folder-kind item with a letter extension may be an unlisted package and asks; package extensions are launchable', () => {
  for (const name of ['Sync.bundle', 'Helper.xpc', 'Share.appex', 'Morning.shortcut', 'Tool.service', 'Some.package']) {
    assert.equal(selectionRunsCode({ items: [{ name, kind: 'folder' }] }), true, name)
  }
  for (const name of ['Run.shortcut', 'Agent.xpc']) assert.equal(selectionRunsCode({ items: [{ name, kind: 'file' }] }), true, name)
  for (const name of ['Reports', 'Photos 2026', 'v2']) assert.equal(selectionRunsCode({ items: [{ name, kind: 'folder' }] }), false, name)
})

test('CU-252 in any app (a file manager or the CU Fixture stand-in): an open whose selection read reports files is judged by it; a non-file list or no read stays unjudged', () => {
  const open = (selection) => at(FIXTURE, key('META', 'O'), { role: 'AXTable', name: '' }, { selection })
  for (const items of [[{ name: 'install.command', kind: 'file' }], [{ name: 'Payload.app', kind: 'folder' }], [{ name: 'notes.txt', kind: 'file' }, { name: 'thing', kind: 'unknown' }]]) {
    assert.deepEqual(verdict(open({ items })), ['confirm', 'launch_code', 'selection:launch_code'], JSON.stringify(items))
  }
  assert.deepEqual(verdict(at(FIXTURE, click, { role: 'AXMenuItem', name: 'Open' }, { selection: { items: [{ name: 'install.command', kind: 'file' }] } })).slice(0, 2), ['confirm', 'launch_code'], 'File > Open on a script')
  for (const selection of [{ items: [{ name: 'notes.txt', kind: 'file' }] }, { items: [{ name: 'Inbox message', kind: 'unknown' }] }, { none: true }, { unreadable: true }, { notCollection: true }, undefined]) {
    assert.equal(open(selection).decision, 'allow', `outside Finder, unjudged: ${JSON.stringify(selection)}`)
  }
})

test('CU-252 through the loop in a non-Finder app: the selection is read for Command-O, a script in a file list asks and nothing is sent', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { createScriptedAdapter } = await import('../../_tools_/agent-core/adapter-scripted.mjs')
  const { createAppApprovals } = await import('../../_tools_/agent-core/app-approvals.mjs')
  const { createRunControl } = await import('../../_tools_/agent-core/control.mjs')
  const { createFakeEnvironment } = await import('../../_tools_/agent-core/fake-env.mjs')
  const { runTask } = await import('../../_tools_/agent-core/loop.mjs')
  const { readRun } = await import('../../_tools_/agent-core/trajectory.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'cu-252-any-'))
  try {
    let reads = 0
    const run = async (items) => {
      const control = createRunControl()
      const environment = createFakeEnvironment({ kind: 'desktop', control })
      environment.state = async () => ({ url: `app:${FIXTURE}`, frontmostBundleId: FIXTURE, dialog: null })
      environment.focusedElement = async () => ({ origin: FIXTURE, role: 'AXTable', name: '', fingerprint: 'list' })
      environment.selectedItems = async () => { reads += 1; return { bundleId: FIXTURE, items } }
      const store = createAppApprovals({ path: join(dir, `a-${Math.random()}.json`) })
      store.grantAlways(FIXTURE, { by: 'api' })
      const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [key('META', 'O')] }, { final: 'done' }] })
      const result = await runTask({ task: 'open it', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
      const event = readRun(result.trajectoryDir).events.find((e) => e.kind === 'action')
      return { event, sent: environment.log.filter((x) => (x.action ?? x)?.type).length }
    }
    const script = await run([{ name: 'install.command', kind: 'file' }])
    assert.deepEqual([script.event.decision, script.event.class, script.sent], ['confirm', 'launch_code', 0])
    const doc = await run([{ name: 'notes.txt', kind: 'file' }])
    assert.deepEqual([doc.event.decision, doc.sent], ['allow', 1])
    assert.equal(reads, 2, 'the selection is read in a non-Finder app')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
