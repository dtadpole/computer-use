import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { after, before, test } from 'node:test'

import { browserAvailable } from '../../_vendor_/browser-use/lib.mjs'
import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { fixtureClient } from '../../_tools_/fixture-site/client.mjs'
import { resolveStep } from '../../_tools_/fixture-site/plans.mjs'
import { startFixtureServer } from '../../_tools_/fixture-site/server.mjs'
import { launchRefusal, recorderEvents, VERIFY_VIEWPORT } from '../../_tools_/verify-kit/driver.mjs'
import { waitForTargets } from '../../_tools_/verify-kit/plan-runner.mjs'
import { loadSut } from '../../_tools_/verify-kit/sut.mjs'
import { verifySeat } from '../../_tools_/verify-kit/seat.mjs'

/** CU-156: the seat this verifier's browsers and runs use - CU_VERIFY_SEAT, else cu-verifier (verify-kit/seat.mjs). */
const SEAT = verifySeat()

/**
 * ULTIMATE_GOAL human-control row: from a local page a person can watch the screen live, pause, take over, hand back
 * and stop a run.
 *
 * One live run (startRun, live view on) whose scripted agent clicks the input recorder's first target every 250 ms.
 * This check acts as the person through the live view's own HTTP surface - the requests its page's buttons send -
 * with the control or the watch token from the URLs startRun hands an in-process harness. Verdicts rest on the
 * input recorder (D-012): the agent's presses land on `odd-a`, the person's on `odd-b`, so who acted is never
 * inferred from the system's own account.
 */

const sut = await loadSut()

let ready = browserAvailable()
let unjudged = ready ? '' : 'no Chrome or Chromium on this machine'
let fixture
let client
let runsDirectory
let handle
let origin
let tokens
let targets

before(async () => {
  fixture = await startFixtureServer({ seed: 'human-control-verifier' })
  client = fixtureClient(fixture)
  runsDirectory = mkdtempSync('/tmp/cu-verifier-runs-')
  if (!ready) return
  await client.reset()
  const plan = async () => ({ actions: resolveStep({ click: 'odd-a' }, await waitForTargets(client, 'input-recorder', ['odd-a'])), delayMs: 250 })
  try {
    handle = await sut.lib.startRun({
      task: { text: 'human-control verifier', meta: { verifier: 'human-control' } },
      startUrl: new URL('/tasks/input-recorder/', fixture.url).href,
      seat: SEAT,
      model: sut.lib.createScriptedAdapter(plan),
      viewport: { ...VERIFY_VIEWPORT },
      bounds: { maxWallMs: 120_000, maxSteps: 400 },
      runsDirectory,
    })
  } catch (error) {
    if (error?.code === 'resource_refused' || error?.reason) {
      ready = false
      unjudged = error.message
      return
    }
    throw error
  }
  const view = new URL(handle.viewUrl)
  origin = view.origin
  tokens = { view: view.searchParams.get('token'), control: new URL(handle.controlUrl).searchParams.get('token') }
  const boxes = await waitForTargets(client, 'input-recorder', ['odd-a', 'odd-b'])
  targets = boxes.targets
})

after(async () => {
  if (handle) {
    handle.control.send({ command: 'stop', reason: 'verifier cleanup' }, { source: 'api' })
    await handle.done.catch(() => {})
  }
  await fixture?.close()
  if (/^\/tmp\/cu-verifier-runs-[A-Za-z0-9]{6}$/.test(runsDirectory ?? '')) rmSync(runsDirectory, { recursive: true, force: true })
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const post = async (path, body, token) => {
  const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  return { status: response.status, body: await response.json().catch(() => null) }
}
const pressesOn = async (target) => (await recorderEvents(client, { quietMs: 150 })).filter((event) => event.type === 'mousedown' && event.target === target).length
async function until(predicate, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return true
    await sleep(150)
  }
  return false
}

test('the live page carries the stable controls, and the event stream greets with the state and a time', { timeout: 30_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const page = await (await fetch(`${origin}/?token=${tokens.control}`)).text()
  for (const id of ['pause', 'resume', 'take-over', 'hand-back', 'stop', 'screen']) assert.match(page, new RegExp(`id="${id}"`), `the page has no #${id}`)
  assert.match(page, /data-state=/)
  const abort = new AbortController()
  const response = await fetch(`${origin}/events`, { headers: { authorization: `Bearer ${tokens.view}` }, signal: abort.signal })
  const reader = response.body.getReader()
  let text = ''
  while (!/\n\n/.test(text)) text += new TextDecoder().decode((await reader.read()).value)
  abort.abort()
  const hello = JSON.parse(text.split('\n').find((line) => line.startsWith('data:')).slice(5))
  assert.equal(typeof hello.at, 'number', 'the hello carries no time')
  assert.ok(['running', 'awaiting_consent', 'paused'].includes(hello.state ?? hello.data?.state), `hello state ${JSON.stringify(hello).slice(0, 120)}`)
})

test('pause holds the agent; resume releases it', { timeout: 40_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  assert.ok(await until(async () => (await pressesOn('odd-a')) >= 2), 'the agent never pressed twice')
  const paused = await post('/control', { command: 'pause' }, tokens.control)
  assert.equal(paused.body?.ok, true, `pause refused: ${JSON.stringify(paused.body)}`)
  await sleep(600)
  const held = await pressesOn('odd-a')
  await sleep(1500)
  assert.equal(await pressesOn('odd-a'), held, 'the agent pressed while paused')
  assert.equal((await post('/control', { command: 'resume' }, tokens.control)).body?.ok, true)
  assert.ok(await until(async () => (await pressesOn('odd-a')) > held), 'the agent did not resume')
})

test('the watch token may not take over or act, and a person may not act before taking over', { timeout: 30_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const takeOver = await post('/control', { command: 'take_over' }, tokens.view)
  assert.notEqual(takeOver.body?.ok, true, 'the watch token took over')
  const fraction = { fx: targets['odd-b'].cx / VERIFY_VIEWPORT.width, fy: targets['odd-b'].cy / VERIFY_VIEWPORT.height }
  assert.equal((await post('/input', { type: 'mouse', action: 'down', ...fraction }, tokens.view)).status, 403, 'the watch token sent input')
  assert.equal((await post('/input', { type: 'mouse', action: 'down', ...fraction }, tokens.control)).status, 409, 'input was accepted without a take-over')
  assert.equal(await pressesOn('odd-b'), 0, 'a press reached the page without a take-over')
})

test('take over stops the agent, the person\'s click lands, hand back resumes the agent', { timeout: 40_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const taken = await post('/control', { command: 'take_over' }, tokens.control)
  assert.equal(taken.body?.ok, true, `take over refused: ${JSON.stringify(taken.body)}`)
  await sleep(600)
  const held = await pressesOn('odd-a')
  const fraction = { fx: targets['odd-b'].cx / VERIFY_VIEWPORT.width, fy: targets['odd-b'].cy / VERIFY_VIEWPORT.height }
  for (const action of ['down', 'up']) assert.equal((await post('/input', { type: 'mouse', action, button: 'left', ...fraction }, tokens.control)).status, 200)
  assert.ok(await until(async () => (await pressesOn('odd-b')) === 1), 'the person\'s click did not reach the page')
  await sleep(1200)
  assert.equal(await pressesOn('odd-a'), held, 'the agent pressed while a person had control')
  assert.equal((await post('/control', { command: 'hand_back', note: 'verifier clicked odd-b' }, tokens.control)).body?.ok, true)
  assert.ok(await until(async () => (await pressesOn('odd-a')) > held), 'the agent did not resume after hand back')
})

test('stop ends the run cancelled and nothing follows', { timeout: 40_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const stopped = await post('/control', { command: 'stop', reason: 'human-control verifier' }, tokens.control)
  assert.equal(stopped.body?.ok, true, `stop refused: ${JSON.stringify(stopped.body)}`)
  const result = await handle.done
  if (launchRefusal(result)) return skipUnless(t, false, launchRefusal(result))
  assert.equal(result.status, 'cancelled', `status ${result.status}`)
  const atEnd = await pressesOn('odd-a')
  await sleep(1200)
  assert.equal(await pressesOn('odd-a'), atEnd, 'the agent pressed after stop')
  handle = null
})
