import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'

import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { startMcpServer } from '../../_tools_/verify-kit/mcp-client.mjs'
import { decodePng } from '../../_tools_/verify-kit/png.mjs'
import { cleanEnvironment, sutRoot } from '../../_tools_/verify-kit/sut.mjs'
import { verifySeat } from '../../_tools_/verify-kit/seat.mjs'

/** CU-156: the seat this verifier's browsers and runs use - CU_VERIFY_SEAT, else cu-verifier (verify-kit/seat.mjs). */
const SEAT = verifySeat()

/**
 * ULTIMATE_GOAL 2.0 integration row, desktop half before the grant: a desktop run through startRun - the root the
 * CLI, the MCP server and the heddle plugin sit on - reaches the helper and returns the final screenshot and a working
 * trajectory link (the run directory and its replay command). The driver runs on the fake helper (this tree's copy,
 * the instrument) through startRun's environmentOptions seam. DSH and heddle sessions on the desktop are M9 and live.
 */

const root = sutRoot()
const RUN = join(root, '_tools_/agent-core/run.mjs')
const CLI = join(root, '_tools_/agent-core/cli.mjs')
const MCP = join(root, '_tools_/computer-use-mcp/server.mjs')
const FAKE = fileURLToPath(new URL('../../_tests_/macos-desktop/fake-helper.mjs', import.meta.url))
const ready = [RUN, CLI, FAKE, join(root, '_environments_/macos-desktop/environment.mjs')].every(existsSync)
const FIXTURE = 'ai.reflection.cu.fixture'
const guard = (t) => skipUnless(t, ready, 'the desktop startRun path or the fake helper has not landed')
const milestone = process.env.CU_VERIFY_MILESTONE ?? 'M9'

/** One desktop startRun on the fake helper; resolves `{ result, inputs, runs }` (remove `runs` after). */
async function desktopStart({ withSeat = true, apps = [FIXTURE], env = cleanEnvironment() } = {}) {
  const imp = (path) => import(pathToFileURL(join(root, path)))
  const [{ startRun }, { createScriptedAdapter }, { connectStdio }, { createAppApprovals }] = await Promise.all(['_tools_/agent-core/run.mjs', '_tools_/agent-core/adapter-scripted.mjs', '_environments_/macos-desktop/helper-link.mjs', '_tools_/agent-core/app-approvals.mjs'].map(imp))
  const world = { grants: { screen: true, accessibility: true, postEvents: true, listenEvents: false }, displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 1280, height: 800 }, scale: 1 }], apps: [{ bundleId: FIXTURE, pid: 900, rect: { x: 0, y: 0, width: 1280, height: 800 } }] }
  const child = spawn(process.execPath, [FAKE], { stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, FAKE_HELPER_CONFIG: JSON.stringify(world), FAKE_HELPER_TOKEN: 'cu-verifier' } })
  const requests = []
  let buffer = ''
  child.stderr.on('data', (chunk) => {
    buffer += chunk
    for (let at = buffer.indexOf('\n'); at !== -1; at = buffer.indexOf('\n')) {
      const line = buffer.slice(0, at)
      buffer = buffer.slice(at + 1)
      if (line.startsWith('REQ ')) requests.push(JSON.parse(line.slice(4)))
    }
  })
  const runs = mkdtempSync(`/tmp/cu-verifier-runs-${process.pid}-`)
  const appApprovals = createAppApprovals({ path: join(runs, 'app-approvals.json') })
  for (const app of apps) appApprovals.grantAlways(app, { by: 'api' })
  try {
    const handle = await startRun({
      // A desktop run starts from a clean environment, as the owner's shell would (startRun refuses loader variables).
      environment: 'macos-desktop', ...(withSeat ? { seat: SEAT } : {}), apps, appApprovals, env, task: 'click once in CU Fixture', runsDirectory: runs, live: false,
      model: createScriptedAdapter({ turns: [{ actions: [{ type: 'click', button: 'left', x: 200, y: 100 }] }, { final: 'Done: clicked.' }] }),
      environmentOptions: { connect: () => connectStdio(child, { token: 'cu-verifier', helloTimeoutMs: 5000 }), runLock: async () => ({ release() {} }) },
    })
    const result = await handle.done
    await new Promise((resolve) => setTimeout(resolve, 100))
    return { result, requests, inputs: requests.filter((r) => r.type === 'input'), runs }
  } catch (error) {
    rmSync(runs, { recursive: true, force: true })
    return { error, requests, runs: null }
  } finally {
    child.kill()
  }
}
const cleanup = (run) => run.runs && /^\/tmp\/cu-verifier-runs-\d+-[A-Za-z0-9]{6}$/.test(run.runs) && rmSync(run.runs, { recursive: true, force: true })

test('a desktop startRun reaches the helper and completes', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  const run = await desktopStart()
  try {
    assert.equal(run.error, undefined, String(run.error?.message))
    assert.equal(run.result.status, 'completed', `status ${run.result.status}: ${run.result.error ?? ''}`)
    assert.ok(run.inputs.some((r) => r.events.some((e) => e.kind === 'down')), 'the click never reached the helper')
    assert.equal(run.result.finalMessage, 'Done: clicked.')
  } finally {
    cleanup(run)
  }
})

test('the result names the final screenshot - a PNG inside the run directory, beside events.jsonl and run.json', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  const run = await desktopStart()
  try {
    const { finalScreenshot, trajectoryDir } = run.result
    assert.ok(finalScreenshot && existsSync(finalScreenshot), `no final screenshot: ${finalScreenshot}`)
    assert.ok(finalScreenshot.startsWith(`${trajectoryDir}/`), 'the final screenshot is outside the run directory')
    const image = decodePng(readFileSync(finalScreenshot))
    assert.ok(image.width > 0 && image.height > 0)
    for (const name of ['events.jsonl', 'run.json']) assert.ok(existsSync(join(trajectoryDir, name)), `no ${name}`)
  } finally {
    cleanup(run)
  }
})

test('the trajectory link works: the replay command replays the desktop run from its directory', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  const run = await desktopStart()
  try {
    assert.match(String(run.result.replayCommand ?? ''), new RegExp(`replay ${run.result.runId}`), 'no replay command naming the run')
    const out = execFileSync(process.execPath, [CLI, 'replay', run.result.trajectoryDir], { encoding: 'utf8', timeout: 20_000 })
    assert.match(out, /click/i, `the replay does not show the click: ${out.slice(0, 200)}`)
    assert.match(out, new RegExp(run.result.runId), 'the replay does not name the run')
  } finally {
    cleanup(run)
  }
})

test('a desktop startRun without a seat or without apps is refused before the helper is reached', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  const noSeat = await desktopStart({ withSeat: false })
  try {
    assert.ok(noSeat.error || noSeat.result?.status === 'error', 'a run without a seat started')
    assert.match(String(noSeat.error?.message ?? noSeat.result?.error), /seat/)
    assert.equal(noSeat.requests.length, 0, 'the helper was reached without a seat')
  } finally {
    cleanup(noSeat)
  }
  const noApps = await desktopStart({ apps: [] })
  try {
    assert.equal(noApps.result?.status ?? 'error', 'error')
    assert.equal(noApps.requests.length, 0, 'the helper was reached without apps')
  } finally {
    cleanup(noApps)
  }
})

/** Whether the agent core under test refuses an unclean environment (PR #229). */
const refusesUnclean = () => readFileSync(RUN, 'utf8').includes('unclean_environment')

test('a desktop startRun from an environment that can load other code is refused before the helper is reached', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  if (!skipUnless(t, refusesUnclean(), 'agent core does not refuse an unclean environment yet (PR #229)')) return
  const run = await desktopStart({ env: { ...cleanEnvironment(), NODE_OPTIONS: '--require=/tmp/cu-verifier-never-loaded.cjs' } })
  try {
    assert.equal(run.result?.status, 'error', `status ${run.result?.status}`)
    assert.match(String(run.result?.error ?? ''), /unclean_environment|clean environment/, String(run.result?.error))
    assert.match(String(run.result?.error ?? ''), /NODE_OPTIONS/, 'the refusal does not name the variable')
    assert.equal(run.requests.length, 0, 'the helper was reached from an unclean environment')
  } finally {
    cleanup(run)
  }
})

test('the CLI runs when started through a symlinked path: its replay shows the run (macOS /tmp is one)', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  const run = await desktopStart()
  const links = mkdtempSync('/tmp/cu-verifier-link-')
  try {
    symlinkSync(join(root, '_tools_/agent-core'), join(links, 'agent-core'))
    const replay = spawnSync(process.execPath, [join(links, 'agent-core/cli.mjs'), 'replay', run.result.trajectoryDir], { encoding: 'utf8', timeout: 20_000 })
    assert.match(replay.stdout, new RegExp(run.result.runId), `through a symlink the CLI printed nothing (exit ${replay.status}): ${replay.stderr.slice(0, 200)}`)
    assert.match(replay.stdout, /click/i)
  } finally {
    rmSync(links, { recursive: true, force: true })
    cleanup(run)
  }
})

test('a CLI desktop run from a DSH-like shell (NODE_PATH set) re-executes clean: it is refused for its seat, not its environment', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  // The seat is no [cu] seat key, so the driver refuses before any lock or helper launch: only the environment check
  // before it differs between a clean re-exec (refused for the seat) and none (refused as unclean_environment).
  const dir = mkdtempSync('/tmp/cu-verifier-cli-')
  try {
    writeFileSync(join(dir, 'plan.json'), JSON.stringify({ turns: [{ final: 'done' }] }))
    const env = { ...cleanEnvironment(), NODE_PATH: '/tmp/cu-verifier-no-such-dir', CU_HOME: join(dir, 'home') }
    const run = spawnSync(process.execPath, [CLI, 'run', '--env', 'macos-desktop', '--seat', 'verifier-probe', '--app', FIXTURE, '--task', 'probe', '--model', 'scripted', '--plan', join(dir, 'plan.json'), '--consent', 'unattended', '--runs-dir', join(dir, 'runs')], { encoding: 'utf8', env, timeout: 20_000 })
    const result = JSON.parse(run.stdout.trim() || '{}')
    assert.doesNotMatch(String(result.error), /clean environment|unclean_environment/, `the run was refused for its environment: ${result.error}`)
    assert.match(String(result.error), /seat must be/, `the run did not reach the driver's seat check: ${result.error ?? run.stderr.slice(0, 200)}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('DSH\'s desktop start refuses what no caller may ask, before any run starts: no apps, browser fields, approval inputs, excluded apps, pre-approved new_app (M9)', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  if (!skipUnless(t, milestone >= 'M9', `M9 check, outside ${milestone}`)) return
  // The seat is no [cu] seat key: a start that slipped through would stop at the driver's seat check, before any lock.
  const dir = mkdtempSync('/tmp/cu-verifier-mcp-')
  const server = startMcpServer(MCP, ['--seat', 'verifier-probe', '--runs-dir', join(dir, 'runs')], { env: { ...cleanEnvironment(), CU_HOME: join(dir, 'home') } })
  try {
    await server.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'cu-verifier', version: '1' } })
    server.notify('notifications/initialized', {})
    const desktop = { environment: 'macos-desktop', task: 'click once in CU Fixture' }
    const cases = [
      ['no apps', desktop, /apps is required/],
      ['a browser field', { ...desktop, apps: [FIXTURE], start_url: 'https://example.com' }, /start_url is for environment chrome-browser/],
      ['an approval-shaped input', { ...desktop, apps: [FIXTURE], approved_apps: [FIXTURE] }, /approved only by a person/],
      ['an excluded app', { ...desktop, apps: ['com.apple.Terminal'] }, /excluded/],
      // Plain 'new_app': only the rule that an app is approved by a person refuses it (an @app form meets another rule).
      ['a pre-approved new_app', { ...desktop, apps: [FIXTURE], pre_approve: ['new_app'] }, /an app is approved only by a person/],
    ]
    for (const [name, args, reason] of cases) {
      const reply = await server.callTool('computer_use_start', args)
      assert.equal(reply.isError, true, `${name}: the start was accepted`)
      assert.match(String(reply.texts?.join(' ')), reason, `${name}: refused for another reason: ${reply.texts?.join(' ')}`)
    }
    assert.ok(!existsSync(join(dir, 'runs')) || readdirSync(join(dir, 'runs')).length === 0, 'a run directory was created')
  } finally {
    server.closeInput()
    await Promise.race([server.exited, new Promise((resolve) => setTimeout(resolve, 3000))])
    server.child.kill()
    rmSync(dir, { recursive: true, force: true })
  }
})

/** An MCP server session; `body(server)` runs after initialize; the server and its directory are always ended. */
async function mcpSession(script, args, env, body) {
  const server = startMcpServer(script, args, { env })
  try {
    await server.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'cu-verifier', version: '1' } }, 8000)
    server.notify('notifications/initialized', {})
    return await body(server)
  } finally {
    server.closeInput()
    await Promise.race([server.exited, new Promise((resolve) => setTimeout(resolve, 3000))])
    server.child.kill()
  }
}

test('DSH\'s MCP server started from a NODE_PATH shell re-executes clean: a desktop start reaches the driver (refused for its seat), not refused for its environment (M9)', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  if (!skipUnless(t, milestone >= 'M9', `M9 check, outside ${milestone}`)) return
  const dir = mkdtempSync('/tmp/cu-verifier-mcp-')
  try {
    const env = { ...cleanEnvironment(), NODE_PATH: '/tmp/cu-verifier-no-such-dir', CU_HOME: join(dir, 'home') }
    const reply = await mcpSession(MCP, ['--seat', 'verifier-probe', '--runs-dir', join(dir, 'runs')], env, (server) => server.callTool('computer_use_start', { environment: 'macos-desktop', task: 'click once in CU Fixture', apps: [FIXTURE] }))
    const text = String(reply.texts?.join(' '))
    assert.doesNotMatch(text, /clean environment|unclean_environment/, `the server did not re-execute clean: ${text}`)
    assert.match(text, /seat must be/, `the start did not reach the driver's seat check: ${text}`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('DSH\'s MCP server answers when started through a symlinked path (M9)', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  if (!skipUnless(t, milestone >= 'M9', `M9 check, outside ${milestone}`)) return
  const links = mkdtempSync('/tmp/cu-verifier-link-')
  try {
    symlinkSync(join(root, '_tools_/computer-use-mcp'), join(links, 'computer-use-mcp'))
    const tools = await mcpSession(join(links, 'computer-use-mcp/server.mjs'), ['--runs-dir', join(links, 'runs')], cleanEnvironment(), (server) => server.request('tools/list', {}))
    assert.match(JSON.stringify(tools.result ?? tools), /computer_use_start/, 'through a symlink the server listed no tools')
  } finally {
    rmSync(links, { recursive: true, force: true })
  }
})

test('DSH can start a desktop run: the MCP server offers macos-desktop (M9)', { timeout: 30_000 }, async (t) => {
  if (!guard(t)) return
  if (!skipUnless(t, milestone >= 'M9', `M9 check, outside ${milestone}`)) return
  const server = startMcpServer(MCP)
  try {
    await server.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'cu-verifier', version: '1' } })
    server.notify('notifications/initialized', {})
    const tools = await server.request('tools/list', {})
    assert.match(JSON.stringify(tools.result ?? tools), /macos-desktop/, 'no MCP tool offers a desktop run')
  } finally {
    server.closeInput()
    await Promise.race([server.exited, new Promise((resolve) => setTimeout(resolve, 3000))])
    server.child.kill()
  }
})
