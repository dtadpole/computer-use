import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { fileNameOf, fileUrlLeafOf } from '../../_environments_/macos-desktop/environment.mjs'
import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

/**
 * CU-255 across the real seam: Finder may hide an extension, so an item shown as 'Payload' can be Payload.app or
 * install.command. The helper reports the element's AXFilename and AXURL; the driver passes the file name and the
 * URL's last component (never its path), and agent core's launch_code check reads them besides the name. Agent core's
 * loop over the real driver and the fake helper: a double click on such an item asks launch_code (declined unattended,
 * nothing posted); a document with the same hidden-extension shape is allowed.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
const dir = mkdtempSync(join(tmpdir(), 'cu-fn-seam-'))
after(() => { locks.remove(); rmSync(dir, { recursive: true, force: true }) })
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })
const inputs = (child) => child.requests.filter((r) => r.type === 'input').length

const ITEM = { bundleId: FIXTURE, pid: 601, role: 'AXImage', subrole: null, title: 'Payload', frame: { x: 100, y: 100, width: 64, height: 64 }, secure: false }
const world = (element) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
  frontmost: FIXTURE,
  elements: [{ rect: element.frame, element }],
})

let runs = 0
async function runOnFake(element, action = { type: 'double_click', x: 132, y: 132 }) {
  const control = createRunControl()
  const { env, child } = await launchOnFake(world(element), { control })
  await logged(child, 3)
  try {
    const store = createAppApprovals({ path: join(dir, `approvals-${runs += 1}.json`) })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame: { width: env.frame.width, height: env.frame.height }, turns: [{ actions: [action] }, { final: 'done' }] })
    const result = await runTask({ task: 'tidy the folder', environment: env, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const text = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8')
    const events = text.trim().split('\n').map((line) => JSON.parse(line))
    const event = events.filter((e) => e.kind === 'action' && e.action?.type === action.type && e.status !== 'attempted').pop()
    return { event, posted: inputs(child), text }
  } finally {
    await env.close()
    await stopFake(child)
  }
}

const summary = (e) => JSON.stringify({ decision: e?.decision, rule: e?.rule, class: e?.class, status: e?.status })

test('CU-255 seam: a double click on an item shown as Payload whose file is Payload.app asks launch_code - nothing posted', async () => {
  const { event, posted } = await runOnFake({ ...ITEM, filename: 'Payload.app', url: 'file:///Applications/Payload.app/' })
  assert.deepEqual([event?.decision, event?.class], ['confirm', 'launch_code'], summary(event))
  assert.equal(posted, 0, 'declined unattended: the double click never reached the helper')
})

test('CU-255 seam: the file name alone is enough (no AXURL): install shown, install.command opened - asks launch_code', async () => {
  const { event, posted } = await runOnFake({ ...ITEM, title: 'install', filename: 'install.command' })
  assert.deepEqual([event?.decision, event?.class], ['confirm', 'launch_code'], summary(event))
  assert.equal(posted, 0)
})

test('CU-255 seam: the URL alone is enough (no AXFilename), and the run records never carry the path or the file name', async () => {
  const { event, posted, text } = await runOnFake({ ...ITEM, title: 'install', url: 'file:///Users/someone/Downloads/install.command' })
  assert.deepEqual([event?.decision, event?.class], ['confirm', 'launch_code'], summary(event))
  assert.equal(posted, 0)
  assert.doesNotMatch(text, /Downloads|someone|install\.command/, 'the events keep origin, role and name only')
})

test('CU-255 seam: a document with a hidden extension (Report, Report.pdf) is a plain double click - allowed and posted', async () => {
  const { event, posted } = await runOnFake({ ...ITEM, title: 'Report', filename: 'Report.pdf', url: 'file:///Users/someone/Report.pdf' })
  assert.equal(event?.decision, 'allow', summary(event))
  assert.equal(posted, 1)
})

test('CU-255 driver: inspectPoint passes the file name and the URL\'s last component only; absent or malformed is null; the fingerprint ignores both', async () => {
  const control = createRunControl()
  const plain = { ...ITEM, frame: { x: 300, y: 100, width: 64, height: 64 } }
  const odd = { ...ITEM, frame: { x: 500, y: 100, width: 64, height: 64 }, filename: 'a/b', url: 'https://example.com/x.dmg' }
  const shown = { ...ITEM, filename: 'Payload.app', url: 'file:///Applications/Payload.app/' }
  const { env, child } = await launchOnFake({ ...world(shown), elements: [{ rect: shown.frame, element: shown }, { rect: plain.frame, element: plain }, { rect: odd.frame, element: odd }] }, { control })
  await logged(child, 3)
  try {
    await env.addApp(FIXTURE)
    const a = await env.inspectPoint({ x: 132, y: 132 })
    assert.deepEqual([a.name, a.filename, a.url], ['Payload', 'Payload.app', 'Payload.app/'])
    const b = await env.inspectPoint({ x: 332, y: 132 })
    assert.deepEqual([b.filename, b.url], [null, null], 'an older helper or a non-file element')
    const c = await env.inspectPoint({ x: 532, y: 132 })
    assert.deepEqual([c.filename, c.url], [null, null], 'a name with a slash; a web URL')
    assert.equal(a.fingerprint, (await env.inspectPoint({ x: 132, y: 132 })).fingerprint)
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('CU-255 driver: fileNameOf and fileUrlLeafOf keep a bare name and a file URL\'s leaf, nothing more', () => {
  assert.equal(fileNameOf(' install.command '), 'install.command')
  for (const bad of [undefined, null, 7, '', '   ', 'a/b', 'x\u0007y', 'y'.repeat(256)]) assert.equal(fileNameOf(bad), null, JSON.stringify(bad))
  assert.equal(fileUrlLeafOf('file:///Applications/Payload.app/'), 'Payload.app/', 'a bundle keeps its trailing slash')
  assert.equal(fileUrlLeafOf('file:///Users/someone/Downloads/install%20me.command'), 'install me.command', 'decoded; no folder')
  for (const bad of [undefined, 'https://example.com/a.dmg', 'file:///', 'not a url', 'file:///a/%E0%A4%A', 'file:///a/b%2Fc']) assert.equal(fileUrlLeafOf(bad), null, JSON.stringify(bad))
})
