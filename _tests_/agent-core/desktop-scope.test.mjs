import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { apiController } from '../../_tools_/agent-core/consent.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { startRun } from '../../_tools_/agent-core/run.mjs'

// cu-verifier's two findings: an approved app must join the helper's scope before its first input, and a desktop
// startRun must pass its seat (and driver seams) to the desktop driver.
const FIXTURE = 'ai.reflection.cu.fixture'
const LEDGER = 'ai.reflection.cu.ledger'
const frame = { width: 1440, height: 900 }
const click = { type: 'click', button: 'left', x: 100, y: 100 }
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-desktop-scope-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function desktopRun({ targetApp, store = null, controller, addApp }) {
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control, frontmost: targetApp, targets: () => ({ origin: targetApp, role: 'AXButton', name: 'Open', fingerprint: 'open' }) })
  const calls = []
  environment.addApp = addApp ?? (async (id) => { calls.push(['addApp', id]) })
  const perform = environment.perform.bind(environment)
  environment.perform = async (action) => { calls.push(['perform', action.type]); return perform(action) }
  const model = createScriptedAdapter({ frame, turns: [{ actions: [click] }, { final: 'done' }] })
  const run = () => runTask({ task: 'desktop task', environment, model, control, controller, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  return { run, calls }
}

test('an app approved during the run joins the helper scope before its first input', async () => {
  const controller = apiController()
  // The start app is always-covered, so the only question is the one for the app met during the run (P11).
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const { run, calls } = desktopRun({ targetApp: LEDGER, store, controller })
  const running = run()
  const request = await controller.waitForRequest(5000)
  assert.deepEqual([request.class, request.recipient], ['new_app', LEDGER])
  assert.equal(request.app, LEDGER, 'the request names the app being approved')
  controller.respond({ id: request.id, approved: true })
  await running
  assert.deepEqual(calls.filter(([kind]) => kind === 'addApp' || kind === 'perform').slice(0, 3), [['addApp', FIXTURE], ['addApp', LEDGER], ['perform', 'click']])
})

test('an app the always store covers joins the helper scope once, without a question; a start app joins once, at the start', async () => {
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(LEDGER, { by: 'api' })
  store.grantAlways(FIXTURE, { by: 'api' })
  const { run, calls } = desktopRun({ targetApp: LEDGER, store })
  await run()
  assert.deepEqual(calls.filter(([kind]) => kind === 'addApp'), [['addApp', FIXTURE], ['addApp', LEDGER]])
  const start = desktopRun({ targetApp: FIXTURE, store })
  await start.run()
  assert.deepEqual(start.calls.filter(([kind]) => kind === 'addApp'), [['addApp', FIXTURE]], 'the helper starts empty; the start app joined before the first capture')
})

test('when the helper refuses to add the app, the action fails closed and nothing is posted', async () => {
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(LEDGER, { by: 'api' })
  store.grantAlways(FIXTURE, { by: 'api' })
  const refuse = async () => { throw Object.assign(new Error('excluded'), { code: 'excluded' }) }
  const { run, calls } = desktopRun({ targetApp: LEDGER, store, addApp: refuse })
  await run()
  assert.equal(calls.filter(([kind]) => kind === 'perform').length, 0)
})

test('a desktop startRun passes its seat and driver seams to the desktop driver; the core fields win', async () => {
  let seen = null
  const handle = await startRun({
    task: 'desktop task', environment: 'macos-desktop', seat: 'cu-verifier', env: {}, apps: [FIXTURE], live: false,
    model: createScriptedAdapter({ frame, turns: [{ final: 'done' }] }), runsDirectory: join(dir, 'runs'),
    appApprovals: createAppApprovals({ path: join(dir, 'app-approvals.json') }),
    environmentOptions: { helper: 'fake', apps: ['com.apple.Terminal'], seat: 'someone-else' },
    launch: async (options) => { seen = options; const env = createFakeEnvironment({ kind: 'desktop', control: options.control }); return env },
  })
  await handle.done
  assert.deepEqual([seen.seat, seen.apps, seen.helper], ['cu-verifier', [FIXTURE], 'fake'])
  await assert.rejects(() => startRun({ environment: 'macos-desktop', apps: [FIXTURE], model: createScriptedAdapter({ frame, turns: [] }) }), /seat/)
})

test('text meant for a secure field is never recorded, even on the secure_field hand-off (T2b)', async () => {
  const { readFileSync } = await import('node:fs')
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  const control = createRunControl()
  const environment = createFakeEnvironment({ kind: 'desktop', control, frontmost: FIXTURE, focused: { origin: FIXTURE, role: 'AXTextField', name: 'Password', secure: true, fingerprint: 'pw' } })
  environment.addApp = async () => {}
  const model = createScriptedAdapter({ frame, turns: [{ actions: [{ type: 'type', text: 'Sup3r-Secret-T2b' }] }, { final: 'done' }] })
  const result = await runTask({ task: 'desktop task', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
  for (const name of ['events.jsonl', 'run.json', 'transcript.json']) {
    assert.ok(!readFileSync(join(result.trajectoryDir, name), 'utf8').includes('Sup3r-Secret-T2b'), name)
  }
})

test('a desktop startRun from an environment that can load other code is refused early, naming the variables', async () => {
  let launched = 0
  const handle = await startRun({
    task: 'desktop task', environment: 'macos-desktop', seat: 'cu-verifier', env: {}, apps: [FIXTURE], live: false,
    model: createScriptedAdapter({ frame, turns: [{ final: 'done' }] }), runsDirectory: join(dir, 'runs'),
    env: { PATH: '/usr/bin', NODE_PATH: '/tmp/x', DYLD_INSERT_LIBRARIES: '/tmp/x.dylib' },
    launch: async () => { launched += 1; return createFakeEnvironment({ kind: 'desktop' }) },
  })
  const result = await handle.done
  assert.equal(result.status, 'error')
  assert.match(String(result.error ?? result.finalMessage), /clean environment.*NODE_PATH.*DYLD_INSERT_LIBRARIES/)
  assert.equal(launched, 0, 'no helper is launched')
})

test('an app joining the helper scope mid-run is noted with why (always store or approved), by bundle id only', async () => {
  const { readFileSync } = await import('node:fs')
  const store = createAppApprovals({ path: join(dir, 'app-approvals.json') })
  store.grantAlways(FIXTURE, { by: 'api' })
  store.grantAlways(LEDGER, { by: 'api' })
  const { run } = desktopRun({ targetApp: LEDGER, store, controller: apiController() })
  const result = await run()
  const notes = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)).filter((e) => e.kind === 'note' && e.scopeAdded)
  assert.deepEqual(notes.map((e) => e.scopeAdded), [{ bundleId: LEDGER, via: 'always' }])
})

