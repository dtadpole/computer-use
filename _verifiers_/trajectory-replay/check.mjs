import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { browserAvailable } from '../../_vendor_/browser-use/lib.mjs'
import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { fixtureClient } from '../../_tools_/fixture-site/client.mjs'
import { resolveStep, TASK_PLANS } from '../../_tools_/fixture-site/plans.mjs'
import { startFixtureServer } from '../../_tools_/fixture-site/server.mjs'
import { isThrowawayProfile, removeThrowawayProfile } from '../../_tools_/verify-kit/browser-gate.mjs'
import { launchRefusal, recorderEvents, VERIFY_VIEWPORT } from '../../_tools_/verify-kit/driver.mjs'
import { targetNames, waitForTargets } from '../../_tools_/verify-kit/plan-runner.mjs'
import { loadSut } from '../../_tools_/verify-kit/sut.mjs'
import { verifySeat } from '../../_tools_/verify-kit/seat.mjs'

/** CU-156: the seat this verifier's browsers and runs use - CU_VERIFY_SEAT, else cu-verifier (verify-kit/seat.mjs). */
const SEAT = verifySeat()

/**
 * ULTIMATE_GOAL trajectory row: every run leaves a readable record - each step's screenshot, actions and result -
 * that survives a crash, replays what happened, and never holds a secret.
 *
 * (1) A sign-in run types the password only as a {{secret:NAME}} placeholder; the value reaches the page (the
 * fixture logs the login) and appears in no file of the run directory. (2) A finished run's `cli.mjs replay` lists
 * exactly as many completed clicks as the input recorder saw. (3) A `cli.mjs run` killed with SIGKILL mid-run
 * leaves a run directory that reads back line by line, holding the clicks the page saw. Evidence: the fixture
 * (D-012) and the files on disk.
 */

const sut = await loadSut()

let ready = browserAvailable()
let unjudged = ready ? '' : 'no Chrome or Chromium on this machine'
let fixture
let client
let runsDirectory

before(async () => {
  fixture = await startFixtureServer({ seed: 'trajectory-replay-verifier' })
  client = fixtureClient(fixture)
  runsDirectory = mkdtempSync('/tmp/cu-verifier-runs-')
})

after(async () => {
  await fixture?.close()
  if (/^\/tmp\/cu-verifier-runs-[A-Za-z0-9]{6}$/.test(runsDirectory ?? '')) rmSync(runsDirectory, { recursive: true, force: true })
})

const url = (id) => new URL(`/tasks/${id}/`, fixture.url).href
const presses = async () => (await recorderEvents(client)).filter((event) => event.type === 'mousedown').length

/** Every file under a directory, recursively. */
function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

/** Processes whose command line names this profile (Chrome and its helpers), from the process table. */
function chromePids(profile) {
  return execFileSync('ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.includes(`--user-data-dir=${profile}`))
    .map((line) => Number(line.trim().split(/\s+/)[0]))
    .filter((pid) => Number.isInteger(pid) && pid > 0)
}

async function start(taskId, plan, { resolveSecret = null, bounds = {}, controller } = {}) {
  try {
    return { handle: await sut.lib.startRun({ task: { text: `trajectory verifier: ${taskId}`, meta: { verifier: 'trajectory-replay', taskId } }, startUrl: url(taskId), seat: SEAT, model: sut.lib.createScriptedAdapter(plan), viewport: { ...VERIFY_VIEWPORT }, bounds: { maxWallMs: 30_000, ...bounds }, runsDirectory, resolveSecret, ...(controller ? { controller } : {}), live: false }) }
  } catch (error) {
    if (error?.code === 'resource_refused' || error?.reason) return { refused: error.message }
    throw error
  }
}

test('a secret typed by reference reaches the page and no file of the run', { timeout: 90_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  await client.reset()
  const expected = (await client.taskState('sign-in')).expected
  const secrets = await client.secrets('sign-in')
  const steps = TASK_PLANS['sign-in'](expected)
  const plan = async (input, { index }) => {
    if (index >= steps.length) return { final: 'Signed in.' }
    const step = steps[index]
    if (step.secret) return { actions: [{ type: 'type', text: `{{secret:${step.secret}}}` }] }
    const names = targetNames(step)
    return { actions: resolveStep(step, names.length ? await waitForTargets(client, 'sign-in', names) : null) }
  }
  // This check is the person: it approves typing the credential, the one class the task needs.
  const controller = sut.lib.apiController()
  const started = await start('sign-in', plan, { resolveSecret: (name) => secrets[name], controller })
  if (started.refused) return skipUnless(t, false, started.refused)
  let finished = false
  const done = started.handle.done.finally(() => (finished = true))
  while (!finished) {
    const request = await controller.waitForRequest(500)
    if (request) controller.respond({ id: request.id, approved: request.class === 'credential', lifetime: 'once' })
  }
  const result = await done
  if (launchRefusal(result)) return skipUnless(t, false, launchRefusal(result))
  const state = await client.settle('sign-in', { quietMs: 300 })
  assert.equal(state.outcome, true, `the login did not succeed, so the secret never reached the page: ${state.reason}`)
  const secret = Buffer.from(secrets.staff_password)
  const holding = filesUnder(result.trajectoryDir).filter((path) => readFileSync(path).includes(secret))
  assert.deepEqual(holding.map((path) => path.slice(result.trajectoryDir.length)), [], 'the secret is written in the run directory')
})

test('replay lists exactly the clicks the page saw', { timeout: 90_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  await client.reset()
  const plan = async (input, { index }) => {
    if (index >= 3) return { final: 'Clicked three times.' }
    return { actions: resolveStep({ click: 'odd-a' }, await waitForTargets(client, 'input-recorder', ['odd-a'])) }
  }
  const started = await start('input-recorder', plan)
  if (started.refused) return skipUnless(t, false, started.refused)
  const result = await started.handle.done
  if (launchRefusal(result)) return skipUnless(t, false, launchRefusal(result))
  assert.equal(result.status, 'completed', `status ${result.status}`)
  const seen = await presses()
  const replay = execFileSync(process.execPath, [sut.cli, 'replay', result.trajectoryDir], { encoding: 'utf8' })
  const clicks = replay.split('\n').filter((line) => /^\s+\d+\. click done/.test(line)).length
  assert.equal(seen, 3)
  assert.equal(clicks, seen, `replay lists ${clicks} completed clicks; the page saw ${seen}`)
  assert.match(replay, /result completed/)
})

test('a run killed with SIGKILL leaves a record that reads back, holding the clicks the page saw', { timeout: 90_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  await client.reset()
  const { targets } = (await client.taskState('input-recorder')).expected
  const a = targets[0]
  const plan = { frame: { width: 1440, height: 900 }, turns: Array.from({ length: 40 }, () => ({ actions: [{ type: 'click', button: 'left', x: a.x, y: a.y }], delayMs: 300 })) }
  const killDir = mkdtempSync('/tmp/cu-verifier-runs-')
  const planPath = join(killDir, 'plan.json')
  writeFileSync(planPath, JSON.stringify(plan))
  const before = new Set(readdirSync('/tmp').filter((name) => name.startsWith(`${SEAT}-chrome-`)))
  const child = spawn(process.execPath, [sut.cli, 'run', '--seat', SEAT, '--task', 'trajectory verifier: killed run', '--start-url', url('input-recorder'), '--model', 'scripted', '--plan', planPath, '--consent', 'unattended', '--runs-dir', killDir, '--max-steps', '40'], { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))
  const closed = new Promise((resolve) => child.once('close', resolve))
  try {
    const deadline = Date.now() + 30_000
    while ((await presses()) < 3 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 150))
    const atKill = await presses()
    if (atKill < 3 && child.exitCode !== null) {
      await closed
      // Only a resource refusal leaves this unjudged; a CLI that ends on its own mid-run fails the row.
      if (/resource_refused/.test(output)) return skipUnless(t, false, 'the resource gate refused the CLI run')
      assert.fail(`the CLI ended on its own after ${atKill} press(es), before it could be killed: ${output.replace(/token=[A-Za-z0-9._~-]+/g, 'token=[redacted]').slice(-400)}`)
    }
    assert.ok(atKill >= 3, 'the run never pressed three times')
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
    await new Promise((resolve) => setTimeout(resolve, 500))
    const seen = await presses()
    const [runDir] = readdirSync(killDir).filter((name) => /^\d{8}T\d{6}Z-[0-9a-f]{6}$/.test(name)).map((name) => join(killDir, name))
    assert.ok(runDir && existsSync(join(runDir, 'run.json')), 'the killed run left no run directory')
    const { header, events } = sut.lib.readRun(runDir)
    assert.equal(header.result, undefined, 'a killed run cannot have written a result')
    const recorded = events.filter((event) => event.kind === 'action' && event.action?.type === 'click' && event.completed === true).length
    assert.ok(recorded >= 3 && recorded >= seen - 1 && recorded <= seen, `the record holds ${recorded} completed clicks; the page saw ${seen}`)
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL')
    // A SIGKILLed CLI cannot stop its Chrome: stop it and remove its profile here (D-005).
    for (const name of readdirSync('/tmp').filter((n) => n.startsWith(`${SEAT}-chrome-`) && !before.has(n))) {
      const profile = `/tmp/${name}`
      for (const pid of chromePids(profile)) {
        try {
          process.kill(pid, 'SIGKILL')
        } catch {
          // already gone
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
      assert.deepEqual(chromePids(profile), [], `Chrome still runs on ${profile} after cleanup`)
      if (isThrowawayProfile(profile)) removeThrowawayProfile(profile)
    }
    if (/^\/tmp\/cu-verifier-runs-[A-Za-z0-9]{6}$/.test(killDir)) rmSync(killDir, { recursive: true, force: true })
  }
})
