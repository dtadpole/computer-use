import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { UsageError, main } from '../../_tools_/agent-core/cli.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { startRun } from '../../_tools_/agent-core/run.mjs'

// C6: desktop runs from startRun and the command line, and `apps list | revoke`. Nothing here launches a driver:
// the CLI gets a startRun seam and startRun a launch seam returning the fake desktop.

const FIXTURE = 'ai.reflection.cu.fixture'
const click = { type: 'click', button: 'left', x: 100, y: 100 }
let dir
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'cu-desktop-cli-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

function spyModel(turns) {
  const model = createScriptedAdapter({ turns })
  const spy = { ...model, opened: 0, async open(options) { spy.opened += 1; return model.open(options) } }
  return spy
}

test('run --env macos-desktop maps --app, --exclude-app and --seat; it needs an app and a seat, not a start URL', async () => {
  const plan = join(dir, 'plan.json')
  writeFileSync(plan, JSON.stringify({ turns: [{ final: 'ok' }] }))
  let seen = null
  const fakeStart = async (options) => {
    seen = options
    return { viewUrl: null, controlUrl: null, done: Promise.resolve({ status: 'completed' }) }
  }
  let out = ''
  const code = await main([
    'run', '--env', 'macos-desktop', '--seat', 'cu-developer-one', '--task', 'tidy', '--app', FIXTURE, '--app=com.apple.TextEdit',
    '--exclude-app', 'ai.reflection.cu.ledger', '--plan', plan, '--consent', 'unattended', '--no-live',
  ], { write: (text) => { out += text }, startRun: fakeStart })
  assert.equal(code, 0)
  assert.equal(JSON.parse(out).status, 'completed')
  assert.deepEqual([seen.environment, seen.apps, seen.excludeApps, seen.live], ['macos-desktop', [FIXTURE, 'com.apple.TextEdit'], ['ai.reflection.cu.ledger'], false])
  assert.deepEqual([seen.startUrl, seen.seat], [undefined, 'cu-developer-one'], 'the desktop run lock names its seat')

  await assert.rejects(main(['run', '--env', 'macos-desktop', '--seat', 'cu-developer-one', '--task', 'tidy', '--plan', plan], { startRun: fakeStart }), /needs --app/)
  await assert.rejects(main(['run', '--env', 'macos-desktop', '--seat', 'cu-developer-one', '--app', FIXTURE, '--plan', plan], { startRun: fakeStart }), /run needs --task/)
  await assert.rejects(
    main(['run', '--task', 'x', '--start-url', 'http://127.0.0.1:1/', '--seat', 'cu-verifier', '--app', FIXTURE, '--plan', plan], { startRun: fakeStart }),
    /--app and --exclude-app are for --env macos-desktop/,
  )
  seen = null
  await main(['run', '--task', 'x', '--start-url', 'http://127.0.0.1:1/', '--seat', 'cu-verifier', '--plan', plan, '--consent', 'unattended'], { write: () => {}, startRun: fakeStart })
  assert.deepEqual([seen.environment, seen.apps, seen.startUrl], [undefined, undefined, 'http://127.0.0.1:1/'], 'a browser run maps as before')
})

test('a desktop run whose local-input pause is not armed ends error before the model, a screenshot or any input', async () => {
  for (const armed of [false, undefined]) {
    const model = spyModel([{ actions: [click] }, { final: 'never' }])
    let env = null
    const run = await startRun({
      environment: 'macos-desktop', seat: 'cu-developer-one', env: {}, apps: [FIXTURE], task: 'tidy', model, runsDirectory: dir, live: false,
      launch: async (options) => {
        env = createFakeEnvironment({ kind: 'desktop', control: options.control })
        env.pauseArmed = armed
        return env
      },
    })
    const result = await run.done
    assert.equal(result.status, 'error')
    assert.match(result.error, /^pause_not_armed: the local-input pause is not armed/)
    assert.deepEqual([model.opened, env.log.length, env.screenshotCount, env.closed], [0, 0, 0, true], String(armed))
    assert.deepEqual([result.steps, result.actions.done, result.usage.costUsd, result.finalMessage], [0, 0, 0, null], 'the early-failure shape')
  }
})

test('a desktop run with no approved app is refused before any live view or driver starts', async () => {
  for (const apps of [[], undefined]) {
    let launched = 0
    let views = 0
    const run = await startRun({
      environment: 'macos-desktop', seat: 'cu-developer-one', env: {}, apps, task: 'tidy', model: spyModel([{ final: 'never' }]), runsDirectory: dir,
      startLiveView: async () => { views += 1; throw new Error('no live view expected') },
      launch: async () => { launched += 1; throw new Error('no launch expected') },
    })
    const result = await run.done
    assert.equal(result.status, 'error')
    assert.match(result.error, /^invalid_argument: .*nothing to act in/)
    assert.deepEqual([launched, views, run.viewUrl], [0, 0, null])
  }
})

test('a desktop run passes its apps, exclusions and the default always store under CU_HOME to the app policy', async () => {
  const home = join(dir, 'home')
  const always = createAppApprovals({ path: join(home, 'app-approvals.json') })
  // The start app too: unattended, an uncovered start app is declined before the run starts (P11).
  for (const id of ['com.apple.TextEdit', FIXTURE]) always.grantAlways(id, { by: 'tty' })
  const prior = process.env.CU_HOME
  process.env.CU_HOME = home
  try {
    let seen = null
    const run = await startRun({
      environment: 'macos-desktop', seat: 'cu-developer-one', env: {}, apps: [FIXTURE], excludeApps: ['ai.reflection.cu.ledger'], task: 'bold it',
      model: spyModel([{ actions: [click] }, { final: 'done' }]), runsDirectory: join(dir, 'runs'), live: false,
      launch: async (options) => {
        seen = options
        return createFakeEnvironment({
          kind: 'desktop', control: options.control, frontmost: 'com.apple.TextEdit',
          targets: () => ({ origin: 'com.apple.TextEdit', role: 'AXButton', name: 'Bold', fingerprint: 'bold' }),
        })
      },
    })
    const result = await run.done
    assert.equal(result.status, 'completed')
    assert.deepEqual([result.actions.done, result.actions.declined], [1, 0], 'the always store approved TextEdit, so nothing was asked')
    assert.deepEqual([seen.apps, seen.control, seen.startUrl, seen.sitePolicy], [[FIXTURE], run.control, undefined, undefined], 'the driver gets apps, not a site')
    const header = JSON.parse(readFileSync(join(result.trajectoryDir, 'run.json'), 'utf8'))
    assert.deepEqual([header.policy.kind, header.policy.scope, header.policy.excludedAdded], ['app', [FIXTURE], ['ai.reflection.cu.ledger']])
  } finally {
    if (prior === undefined) delete process.env.CU_HOME
    else process.env.CU_HOME = prior
  }
})

test('apps list and apps revoke work on the always store under CU_HOME; a corrupt store is named, never rewritten', async () => {
  const home = join(dir, 'home')
  const path = join(home, 'app-approvals.json')
  let out = ''
  const io = { write: (text) => { out += text }, env: { CU_HOME: home } }
  assert.equal(await main(['apps', 'list'], io), 0)
  assert.equal(out, 'no always-approved apps\n')

  const store = createAppApprovals({ path, now: () => new Date('2026-11-02T09:00:00Z') })
  store.grantAlways('com.apple.TextEdit', { by: 'tty' })
  out = ''
  assert.equal(await main(['apps', 'list'], io), 0)
  assert.equal(out, 'com.apple.TextEdit  granted 2026-11-02T09:00:00.000Z  by tty\n')

  out = ''
  assert.equal(await main(['apps', 'revoke', 'com.apple.TextEdit'], io), 0)
  assert.equal(out, 'revoked com.apple.TextEdit\n')
  assert.equal(store.covers('com.apple.TextEdit'), false)
  out = ''
  assert.equal(await main(['apps', 'revoke', 'com.apple.TextEdit'], io), 1, 'an id that was not stored exits 1')
  assert.match(out, /not always-approved; nothing removed/)
  await assert.rejects(main(['apps', 'revoke'], io), UsageError)
  await assert.rejects(main(['apps', 'grant', FIXTURE], io), UsageError)

  writeFileSync(path, '{not json')
  out = ''
  assert.equal(await main(['apps', 'list'], io), 1)
  assert.match(out, /is unreadable, so it approves no app/)
  assert.equal(readFileSync(path, 'utf8'), '{not json')
})

test('cli.mjs started through a symlinked path still runs (cu-verifier finding: it exited 0 having done nothing)', async () => {
  const { symlinkSync } = await import('node:fs')
  const { spawnSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const { dirname } = await import('node:path')
  const { isEntryPoint } = await import('../../_tools_/agent-core/cli.mjs')
  const real = fileURLToPath(new URL('../../_tools_/agent-core/cli.mjs', import.meta.url))
  const link = join(dir, 'agent-core-link')
  symlinkSync(dirname(real), link)
  assert.equal(isEntryPoint(join(link, 'cli.mjs'), new URL(`file://${real}`).href), true)
  assert.equal(isEntryPoint(join(dir, 'other.mjs'), new URL(`file://${real}`).href), false)
  const run = spawnSync(process.execPath, [join(link, 'cli.mjs'), 'replay', join(dir, 'missing-run')], { encoding: 'utf8', env: { PATH: process.env.PATH } })
  assert.notEqual(`${run.stdout}${run.stderr}`.trim(), '', 'it prints something instead of exiting silently')
  assert.notEqual(run.status, 0)
})

test('a desktop run from a DSH-like environment re-executes once with the loader variables deleted', async () => {
  const { needsCleanExec, withoutLoaders } = await import('../../_tools_/agent-core/cli.mjs')
  const env = { PATH: '/usr/bin', HOME: '/h', NODE_PATH: '/x', NODE_OPTIONS: '', DYLD_INSERT_LIBRARIES: '/y', LD_PRELOAD: '/z', NODE_ENV: 'test' }
  assert.deepEqual(withoutLoaders(env), { PATH: '/usr/bin', HOME: '/h', NODE_ENV: 'test' }, 'deleted, not emptied; other variables kept')
  const desktop = ['run', '--env', 'macos-desktop', '--seat', 'cu-x', '--task', 't', '--app', 'a.b']
  assert.equal(needsCleanExec(desktop, env), true)
  assert.equal(needsCleanExec(['run', '--env=macos-desktop'], { PATH: '/usr/bin' }, ['--no-warnings']), true, 'node flags before the entry are refused too')
  assert.equal(needsCleanExec(desktop, withoutLoaders(env), []), false, 'the clean child does not exec again')
  assert.equal(needsCleanExec(['run', '--start-url', 'http://127.0.0.1:1/', '--seat', 'cu-x', '--task', 't'], env), false, 'browser runs are untouched')
  assert.equal(needsCleanExec(['replay', 'x'], env), false)
  // End to end without launching anything: the re-executed child reaches its usage check and its exit code comes back.
  const { spawnSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const cli = fileURLToPath(new URL('../../_tools_/agent-core/cli.mjs', import.meta.url))
  const run = spawnSync(process.execPath, [cli, 'run', '--env', 'macos-desktop', '--seat', 'cu-developer-one', '--task', 't'], { encoding: 'utf8', env: { PATH: process.env.PATH, NODE_PATH: '/nonexistent' } })
  assert.equal(run.status, 64, `${run.stdout}${run.stderr}`)
  assert.match(run.stderr, /usage/)
})

test('run --env macos-desktop --input-mode pid reaches the driver as environmentOptions.mode; bad or browser uses are refused', async () => {
  const plan = join(dir, 'plan.json')
  writeFileSync(plan, JSON.stringify({ turns: [{ final: 'ok' }] }))
  let seen = null
  const fakeStart = async (options) => { seen = options; return { viewUrl: null, controlUrl: null, done: Promise.resolve({ status: 'completed' }) } }
  const base = ['run', '--env', 'macos-desktop', '--seat', 'cu-developer-one', '--task', 't', '--app', FIXTURE, '--plan', plan, '--consent', 'unattended', '--no-live']
  assert.equal(await main([...base, '--input-mode', 'pid'], { write: () => {}, startRun: fakeStart }), 0)
  assert.deepEqual(seen.environmentOptions, { mode: 'pid' })
  await main(base, { write: () => {}, startRun: fakeStart })
  assert.equal(seen.environmentOptions, undefined, 'default: the driver chooses global')
  await assert.rejects(main([...base, '--input-mode', 'ax'], { startRun: fakeStart }), /global or pid/)
  await assert.rejects(main(['run', '--task', 't', '--start-url', 'http://127.0.0.1:1/', '--seat', 'cu-developer-one', '--plan', plan, '--input-mode', 'pid'], { startRun: fakeStart }), /for --env macos-desktop/)
})


test('CU-61: run --env macos-desktop --simulate-scale 2 reaches the driver as environmentOptions.simulateScale; other values or browser uses are refused', async () => {
  const plan = join(dir, 'plan.json')
  writeFileSync(plan, JSON.stringify({ turns: [{ final: 'ok' }] }))
  let seen = null
  const fakeStart = async (options) => { seen = options; return { viewUrl: null, controlUrl: null, done: Promise.resolve({ status: 'completed' }) } }
  const base = ['run', '--env', 'macos-desktop', '--seat', 'cu-researcher', '--task', 't', '--app', FIXTURE, '--plan', plan, '--consent', 'unattended', '--no-live']
  assert.equal(await main([...base, '--simulate-scale', '2'], { write: () => {}, startRun: fakeStart }), 0)
  assert.deepEqual(seen.environmentOptions, { simulateScale: 2 })
  await main([...base, '--simulate-scale', '2', '--input-mode', 'pid'], { write: () => {}, startRun: fakeStart })
  assert.deepEqual(seen.environmentOptions, { mode: 'pid', simulateScale: 2 }, 'both seams together')
  await assert.rejects(main([...base, '--simulate-scale', '3'], { startRun: fakeStart }), /--simulate-scale is 2/)
  await assert.rejects(main(['run', '--task', 't', '--start-url', 'http://127.0.0.1:1/', '--seat', 'cu-researcher', '--plan', plan, '--simulate-scale', '2'], { startRun: fakeStart }), /for --env macos-desktop/)
})

test('CU-70: run --env macos-desktop --simulate-display WxH reaches the driver as environmentOptions.simulateDisplay; malformed or browser uses are refused', async () => {
  const plan = join(dir, 'plan-display.json')
  writeFileSync(plan, JSON.stringify({ turns: [{ final: 'ok' }] }))
  let seen = null
  const fakeStart = async (options) => { seen = options; return { viewUrl: null, controlUrl: null, done: Promise.resolve({ status: 'completed' }) } }
  const base = ['run', '--env', 'macos-desktop', '--seat', 'cu-researcher', '--task', 't', '--app', FIXTURE, '--plan', plan, '--consent', 'unattended', '--no-live']
  assert.equal(await main([...base, '--simulate-display', '1512x982', '--simulate-scale', '2'], { write: () => {}, startRun: fakeStart }), 0)
  assert.deepEqual(seen.environmentOptions, { simulateScale: 2, simulateDisplay: { width: 1512, height: 982 } }, 'with the scale seam, a 14-inch Retina laptop')
  await main([...base, '--simulate-display', '1280x800'], { write: () => {}, startRun: fakeStart })
  assert.deepEqual(seen.environmentOptions, { simulateDisplay: { width: 1280, height: 800 } }, 'alone, at the display\'s own scale')
  for (const bad of ['1512', '1512x', 'x982', '15x982', '1512X982', '1512x982x2']) {
    await assert.rejects(main([...base, '--simulate-display', bad], { startRun: fakeStart }), /--simulate-display is WIDTHxHEIGHT in points/, bad)
  }
  await assert.rejects(main(['run', '--task', 't', '--start-url', 'http://127.0.0.1:1/', '--seat', 'cu-researcher', '--plan', plan, '--simulate-display', '1512x982'], { startRun: fakeStart }), /--simulate-display is for --env macos-desktop/)
})
