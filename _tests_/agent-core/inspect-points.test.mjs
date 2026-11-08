import assert from 'node:assert/strict'
import { test } from 'node:test'

import { main, needsCleanExec, UsageError } from '../../_tools_/agent-core/cli.mjs'
import { inspectPoints } from '../../_tools_/agent-core/run.mjs'

// cli.mjs inspect (D-045): a read-only look at the element under global screen points - no input, no model.

const FIXTURE = 'ai.reflection.cu.fixture'
const LEDGER = 'ai.reflection.cu.ledger'

function fakeDesktop({ frame = { width: 1920, height: 1080, originPt: { x: 0, y: 0 }, scaleX: 1, scaleY: 1, display: 1 }, describe = () => null } = {}) {
  const calls = { addApp: [], inspectPoint: [], perform: 0, close: 0, launch: null }
  const environment = {
    frame,
    async addApp(app) { calls.addApp.push(app) },
    async inspectPoint(point) { calls.inspectPoint.push(point); return describe(point) },
    async perform() { calls.perform += 1; throw new Error('inspect must never post input') },
    async screenshot() { throw new Error('inspect keeps no capture') },
    async close() { calls.close += 1 },
  }
  const launch = async (options) => { calls.launch = options; return environment }
  return { calls, launch }
}

test('inspect admits only always-approved apps, describes each point, closes, and never posts input or opens a model', async () => {
  const { calls, launch } = fakeDesktop({ describe: ({ x }) => (x === 483 ? { origin: FIXTURE, role: 'AXTextField', name: '', panel: 'save', fingerprint: 'f' } : null) })
  let modelOpened = 0
  const result = await inspectPoints({
    seat: 'cu-verifier', apps: [FIXTURE, LEDGER], points: [{ x: 483, y: 724 }, { x: 10, y: 10 }], env: {},
    launch, appApprovals: { covers: (id) => id === FIXTURE },
    model: { async open() { modelOpened += 1; throw new Error('no model') } },
  })
  assert.equal(calls.launch.seat, 'cu-verifier', 'the desktop-run lock names the seat')
  assert.equal(calls.launch.noInput, true, 'CU-217 (D-066): inspect declares it posts nothing, so the owner-idle check does not apply')
  assert.deepEqual(calls.addApp, [FIXTURE], 'only the always-approved app joins the scope')
  assert.deepEqual(result.scope.map((s) => [s.app, s.added]), [[FIXTURE, true], [LEDGER, false]])
  assert.equal(result.points[0].target.panel, 'save')
  assert.equal(result.points[0].target.role, 'AXTextField')
  assert.equal(result.points[1].target, null)
  assert.equal(calls.perform, 0, 'no input')
  assert.equal(modelOpened, 0, 'no model')
  assert.equal(calls.close, 1)
})

test('CU-154: inspect prints a menu item\'s key equivalent (read-only), null when the target has none', async () => {
  const PASTE = { origin: FIXTURE, role: 'AXMenuItem', name: 'Paste', keyEquivalent: { char: 'V', modifiers: 0 }, fingerprint: 'p' }
  const { calls, launch } = fakeDesktop({ describe: ({ x }) => (x === 483 ? PASTE : { origin: FIXTURE, role: 'AXButton', name: 'OK', fingerprint: 'b' }) })
  const result = await inspectPoints({ seat: 'cu-verifier', apps: [FIXTURE], points: [{ x: 483, y: 724 }, { x: 10, y: 10 }], env: {}, launch, appApprovals: { covers: () => true } })
  assert.deepEqual(result.points[0].target.keyEquivalent, { char: 'V', modifiers: 0 }, 'Edit > Paste shows its Command-V (the driver\'s { char, modifiers })')
  assert.equal(result.points[1].target.keyEquivalent, null, 'a target without one prints null')
  assert.equal(calls.perform, 0, 'still no input')
})

test('CU-217: no caller can turn inspect\'s noInput off - it is set after the environment options', async () => {
  const { calls, launch } = fakeDesktop()
  await inspectPoints({ seat: 'cu-verifier', apps: [FIXTURE], points: [{ x: 1, y: 1 }], env: {}, launch, appApprovals: { covers: () => true }, environmentOptions: { noInput: false } })
  assert.equal(calls.launch.noInput, true)
})

test('inspect maps global points to the frame the driver uses', async () => {
  const { calls, launch } = fakeDesktop({ frame: { width: 1600, height: 900, originPt: { x: 100, y: 50 }, scaleX: 0.5, scaleY: 0.5, display: 2 } })
  await inspectPoints({ seat: 'cu-verifier', apps: [FIXTURE], points: [{ x: 483, y: 724 }], env: {}, launch, appApprovals: { covers: () => true } })
  assert.deepEqual(calls.inspectPoint, [{ x: Math.round((483 - 100) * 0.5), y: Math.round((724 - 50) * 0.5) }])
})

test('inspect refuses an environment that can load code, before launching anything', async () => {
  const { calls, launch } = fakeDesktop()
  await assert.rejects(() => inspectPoints({ seat: 'cu-verifier', apps: [FIXTURE], points: [{ x: 1, y: 1 }], env: { NODE_PATH: '/x' }, launch, appApprovals: { covers: () => true } }), (error) => error.code === 'unclean_environment')
  assert.equal(calls.launch, null)
})

test('cli inspect maps its flags, prints JSON, and refuses bad usage; it re-executes clean like a desktop run', async () => {
  const seen = []
  let out = ''
  const code = await main(['inspect', '--env', 'macos-desktop', '--seat', 'cu-verifier', '--app', FIXTURE, '--at', '483,724', '--at', '10,20'], {
    write: (text) => { out += text }, env: {}, inspectPoints: async (options) => { seen.push(options); return { points: [] } },
  })
  assert.equal(code, 0)
  assert.deepEqual(seen[0].points, [{ x: 483, y: 724 }, { x: 10, y: 20 }])
  assert.deepEqual(seen[0].apps, [FIXTURE])
  assert.equal(seen[0].seat, 'cu-verifier')
  assert.deepEqual(JSON.parse(out), { points: [] })
  for (const argv of [
    ['inspect', '--seat', 'cu-verifier', '--app', FIXTURE, '--at', '1,1'],
    ['inspect', '--env', 'macos-desktop', '--seat', 'cu-verifier', '--app', FIXTURE],
    ['inspect', '--env', 'macos-desktop', '--seat', 'cu-verifier', '--app', FIXTURE, '--at', '1;1'],
  ]) {
    await assert.rejects(() => main(argv, { write: () => {}, env: {}, inspectPoints: async () => ({}) }), UsageError, argv.join(' '))
  }
  assert.equal(needsCleanExec(['inspect', '--env', 'macos-desktop'], { NODE_PATH: '/x' }), true)
})

test('inspect --panel reads the panel selection once and says what agent core would resolve; still no input', async () => {
  const { calls, launch } = fakeDesktop()
  let reads = 0
  const withPanel = async (selection) => {
    const run = await launch({})
    return { ...run, frame: run.frame, async addApp(a) { calls.addApp.push(a) }, async inspectPoint() { return null }, async perform() { calls.perform += 1 }, async close() {}, async panelSelection() { reads += 1; return selection } }
  }
  const typed = await inspectPoints({ seat: 'cu-verifier', apps: [FIXTURE], points: [], panel: true, env: {}, launch: () => withPanel({ path: null, directory: null, name: '~/Library/LaunchAgents/probe.plist' }), appApprovals: { covers: () => true } })
  assert.equal(typed.panel.destination.known, true)
  assert.equal(typed.panel.destination.protected, true, 'a typed protected path is reported protected')
  assert.equal(typed.panel.selection.name, '~/Library/LaunchAgents/probe.plist')
  const unknown = await inspectPoints({ seat: 'cu-verifier', apps: [FIXTURE], points: [], panel: true, env: {}, launch: () => withPanel({ path: null, directory: null, name: 'report.pdf' }), appApprovals: { covers: () => true } })
  assert.deepEqual(unknown.panel.destination, { path: null, known: false, protected: null })
  assert.equal(reads, 2, 'one read per inspection')
  assert.equal(calls.perform, 0, 'no input')
  const { launch: plain } = fakeDesktop()
  const unsupported = await inspectPoints({ seat: 'cu-verifier', apps: [FIXTURE], points: [], panel: true, env: {}, launch: plain, appApprovals: { covers: () => true } })
  assert.match(unsupported.panel.error, /unsupported/)
  let seen
  await main(['inspect', '--env', 'macos-desktop', '--seat', 'cu-verifier', '--app', FIXTURE, '--panel'], { write: () => {}, env: {}, inspectPoints: async (options) => { seen = options; return {} } })
  assert.equal(seen.panel, true)
  assert.deepEqual(seen.points, [], '--panel alone needs no --at')
})

