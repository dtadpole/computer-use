import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { after, before, test } from 'node:test'

import { browserAvailable } from '../../_vendor_/browser-use/lib.mjs'
import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { fixtureClient } from '../../_tools_/fixture-site/client.mjs'
import { judgeRun } from '../../_tools_/fixture-site/judge.mjs'
import { resolveStep, TASK_PLANS } from '../../_tools_/fixture-site/plans.mjs'
import { startFixtureServer } from '../../_tools_/fixture-site/server.mjs'
import { launchRefusal, recorderEvents, VERIFY_VIEWPORT } from '../../_tools_/verify-kit/driver.mjs'
import { targetNames, waitForTargets } from '../../_tools_/verify-kit/plan-runner.mjs'
import { loadSut } from '../../_tools_/verify-kit/sut.mjs'
import { verifySeat } from '../../_tools_/verify-kit/seat.mjs'

/** CU-156: the seat this verifier's browsers and runs use - CU_VERIFY_SEAT, else cu-verifier (verify-kit/seat.mjs). */
const SEAT = verifySeat()

/**
 * ULTIMATE_GOAL agent-loop row: screenshot, model, actions, repeat, until the task is done, the user is needed, or a
 * step, time or cost bound is hit.
 *
 * Runs go through agent-core's in-process composition root (`startRun`, the one cli.mjs sits on) with the scripted
 * model, whose plan reads the fixture's target boxes at each turn. Verdicts rest on the fixture (D-012): a task's
 * outcome from page state, and every bound from the input recorder's own count of presses - at the bound, and none
 * after the run ends. The Claude adapter's pure `parseTurn` is judged on wire fixtures held here.
 */

const sut = await loadSut()

let ready = browserAvailable()
let unjudged = ready ? '' : 'no Chrome or Chromium on this machine'
let fixture
let client
let runsDirectory

before(async () => {
  fixture = await startFixtureServer({ seed: 'agent-loop-verifier' })
  client = fixtureClient(fixture)
  runsDirectory = mkdtempSync('/tmp/cu-verifier-runs-')
})

after(async () => {
  await fixture?.close()
  if (/^\/tmp\/cu-verifier-runs-[A-Za-z0-9]{6}$/.test(runsDirectory ?? '')) rmSync(runsDirectory, { recursive: true, force: true })
})

const url = (id) => new URL(`/tasks/${id}/`, fixture.url).href

/** Start a scripted run; resolves to `{ handle }` or `{ refused }` (a resource refusal is unjudged). */
async function start(taskId, plan, bounds = {}) {
  try {
    const handle = await sut.lib.startRun({
      task: { text: `agent-loop verifier: ${taskId}`, meta: { verifier: 'agent-loop', taskId } },
      startUrl: url(taskId),
      seat: SEAT,
      model: sut.lib.createScriptedAdapter(plan),
      viewport: { ...VERIFY_VIEWPORT },
      bounds: { maxWallMs: 20_000, ...bounds },
      runsDirectory,
      live: false,
    })
    return { handle }
  } catch (error) {
    if (error?.code === 'resource_refused' || error?.reason) return { refused: `the resource gate refused the run: ${error.message}` }
    throw error
  }
}

/** A plan that clicks the recorder's first target on every turn, never finishing. */
function clickForever({ usage, delayMs, counter } = {}) {
  return async () => {
    if (counter) counter.requests += 1
    const boxes = await waitForTargets(client, 'input-recorder', ['odd-a'])
    return { actions: resolveStep({ click: 'odd-a' }, boxes), ...(usage ? { usage } : {}), ...(delayMs ? { delayMs } : {}) }
  }
}

const presses = async () => (await recorderEvents(client)).filter((event) => event.type === 'mousedown').length

/** Presses at the end of a run, and again a second later: nothing may follow the end. */
async function pressesAfterEnd() {
  const atEnd = await presses()
  await new Promise((resolve) => setTimeout(resolve, 1000))
  return { atEnd, later: await presses() }
}

test('a scripted run completes visitor-badge, judged from page state', { timeout: 90_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  await client.reset()
  const expected = (await client.taskState('visitor-badge')).expected
  const steps = TASK_PLANS['visitor-badge'](expected)
  const plan = async (input, { index }) => {
    if (index >= steps.length) return { final: `Created a badge for ${expected.name}.` }
    const names = targetNames(steps[index])
    const boxes = names.length ? await waitForTargets(client, 'visitor-badge', names) : null
    return { actions: resolveStep(steps[index], boxes) }
  }
  const started = await start('visitor-badge', plan)
  if (started.refused) return skipUnless(t, false, started.refused)
  const result = await started.handle.done
  if (launchRefusal(result)) return skipUnless(t, false, launchRefusal(result))
  assert.equal(result.status, 'completed', `status ${result.status}: ${result.error ?? result.finalMessage}`)
  const state = await client.settle('visitor-badge', { quietMs: 300 })
  assert.equal(state.outcome, true, state.reason)
  assert.equal(judgeRun(state, { finalAnswer: result.finalMessage, claimedDone: true }).verdict, 'pass')
})

// run-outcomes.md: maxSteps counts model requests; a call returned by the last allowed request is recorded, not
// executed. So 3 requests reach the model and 2 batches reach the page.
test('max_steps 3: three model requests, two batches on the page, then nothing', { timeout: 60_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  await client.reset()
  const counter = { requests: 0 }
  const started = await start('input-recorder', clickForever({ counter }), { maxSteps: 3, maxWallMs: 8000 })
  if (started.refused) return skipUnless(t, false, started.refused)
  const result = await started.handle.done
  if (launchRefusal(result)) return skipUnless(t, false, launchRefusal(result))
  const { atEnd, later } = await pressesAfterEnd()
  assert.equal(result.status, 'max_steps', `status ${result.status}`)
  assert.equal(counter.requests, 3, `the model was asked ${counter.requests} times under a bound of 3 requests`)
  assert.equal(atEnd, 2, `the page saw ${atEnd} presses; the third request's call must be recorded, not executed`)
  assert.equal(later, atEnd, 'a press reached the page after the run ended')
})

test('max_cost 0.05 USD at 0.02 a turn: the turn that crosses the cap is the last to act', { timeout: 60_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  await client.reset()
  const started = await start('input-recorder', clickForever({ usage: { inputTokens: 1000, outputTokens: 50, costUsd: 0.02 } }), { maxCostUsd: 0.05, maxWallMs: 8000 })
  if (started.refused) return skipUnless(t, false, started.refused)
  const result = await started.handle.done
  if (launchRefusal(result)) return skipUnless(t, false, launchRefusal(result))
  const { atEnd, later } = await pressesAfterEnd()
  assert.equal(result.status, 'max_cost', `status ${result.status}`)
  assert.equal(atEnd, 3, `the page saw ${atEnd} presses; cumulative cost reaches 0.05 on the third turn`)
  assert.equal(later, atEnd, 'a press reached the page after the run ended')
  assert.ok(Math.abs(result.usage.costUsd - 0.06) < 1e-9, `reported cost ${result.usage.costUsd}`)
})

test('max_time 1.5 s at 0.4 s a turn: the run stops near the bound and nothing follows', { timeout: 60_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  await client.reset()
  const startedAt = Date.now()
  const started = await start('input-recorder', clickForever({ delayMs: 400 }), { maxWallMs: 1500 })
  if (started.refused) return skipUnless(t, false, started.refused)
  const result = await started.handle.done
  if (launchRefusal(result)) return skipUnless(t, false, launchRefusal(result))
  const elapsed = Date.now() - startedAt
  const { atEnd, later } = await pressesAfterEnd()
  assert.equal(result.status, 'max_time', `status ${result.status}`)
  assert.ok(atEnd >= 1 && atEnd <= 4, `the page saw ${atEnd} presses in a 1.5 s run of 0.4 s turns`)
  assert.equal(later, atEnd, 'a press reached the page after the run ended')
  assert.ok(elapsed < 15_000, `the run took ${elapsed} ms against a 1.5 s bound (browser start included)`)
})

test('stop from the harness: the run ends cancelled and no press follows', { timeout: 60_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  await client.reset()
  const started = await start('input-recorder', clickForever({ delayMs: 250 }))
  if (started.refused) return skipUnless(t, false, started.refused)
  const { handle } = started
  // A run that ends before pressing twice (the browser refused at launch, e.g. the seat's previous browser still
  // closing after check 4) is reported by its own end, not as 'never pressed twice' after a 15 s wait.
  let ended = null
  handle.done.then((result) => { ended = result }, () => {})
  const deadline = Date.now() + 15_000
  while ((await presses()) < 2 && ended === null && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100))
  if (ended !== null && launchRefusal(ended)) return skipUnless(t, false, launchRefusal(ended))
  assert.ok((await presses()) >= 2, ended !== null
    ? `the run ended (${ended.status}${ended.error ? `: ${ended.error}` : ''}) before pressing twice, so a stop would prove nothing`
    : 'the run never pressed twice, so a stop would prove nothing')
  const answer = handle.control.send({ command: 'stop', reason: 'agent-loop verifier' }, { source: 'api' })
  assert.equal(answer.ok, true, `stop was refused: ${answer.error}`)
  const atStop = await presses()
  const result = await handle.done
  if (launchRefusal(result)) return skipUnless(t, false, launchRefusal(result))
  const { atEnd, later } = await pressesAfterEnd()
  assert.equal(result.status, 'cancelled', `status ${result.status}`)
  assert.ok(atEnd <= atStop + 1, `${atEnd - atStop} presses reached the page after stop`)
  assert.equal(later, atEnd, 'a press reached the page after the run ended')
})

/** Wire fixtures: Messages response bodies in the gateway's native computer toolset, as cu-developer-one recorded it. */
const WIRE = [
  {
    name: 'left_click with a held modifier',
    body: { content: [{ type: 'tool_use', id: 'tu_1', name: 'left_click', toolset_name: 'computer', input: { coordinate: [401, 201], text: 'shift' } }], stop_reason: 'tool_use', usage: { input_tokens: 1200, output_tokens: 40 } },
    actions: [{ type: 'click', button: 'left', x: 401, y: 201, keys: ['SHIFT'] }],
  },
  {
    name: 'a key chord, typing and a scroll in one turn',
    body: {
      content: [
        { type: 'text', text: 'Saving.' },
        { type: 'tool_use', id: 'tu_2', name: 'key', toolset_name: 'computer', input: { text: 'ctrl+s' } },
        { type: 'tool_use', id: 'tu_3', name: 'type', toolset_name: 'computer', input: { text: 'Mira' } },
        { type: 'tool_use', id: 'tu_4', name: 'scroll', toolset_name: 'computer', input: { coordinate: [500, 300], scroll_direction: 'down', scroll_amount: 3 } },
      ],
      stop_reason: 'tool_use',
    },
    actions: [{ type: 'keypress', keys: ['CTRL', 'S'] }, { type: 'type', text: 'Mira' }, { type: 'scroll', x: 500, y: 300, scroll_x: 0, scroll_y: 300 }],
  },
  {
    name: 'an unknown tool becomes an action the validator refuses by name',
    body: { content: [{ type: 'tool_use', id: 'tu_5', name: 'hold_key', toolset_name: 'computer', input: { text: 'a' } }], stop_reason: 'tool_use' },
    actions: [{ type: 'hold_key' }],
  },
]

test('parseTurn maps wire responses to canonical actions, final turns and usage', () => {
  for (const fixture of WIRE) {
    const { turn } = sut.lib.parseClaudeTurn(fixture.body)
    assert.equal(turn.stop, 'call', fixture.name)
    assert.deepEqual(turn.call.actions, fixture.actions, fixture.name)
  }
  assert.equal(sut.lib.parseClaudeTurn(WIRE[0].body).turn.usage.inputTokens, 1200)
  const final = sut.lib.parseClaudeTurn({ content: [{ type: 'text', text: 'Locker 14, code 2047.' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 9 } })
  assert.deepEqual([final.turn.stop, final.turn.message], ['final', 'Locker 14, code 2047.'])
  const unknown = sut.lib.validateBatch(sut.lib.parseClaudeTurn(WIRE[2].body).turn.call.actions, { frame: { width: 1024, height: 768 }, extensions: [] })
  assert.equal(unknown.ok, false)
  assert.equal(unknown.results[0].code, 'unsupported_action')
})

/** OpenAI's documented Responses wire shapes (_context_/chatgpt-computer-use/api-computer-tool.md, call_002). */
test('parseResponsesTurn maps OpenAI\'s documented computer_call to the same batch, in order', () => {
  const documented = { output: [{ type: 'computer_call', call_id: 'call_002', actions: [{ type: 'click', button: 'left', x: 405, y: 157 }, { type: 'type', text: 'penguin' }], status: 'completed' }] }
  const call = sut.lib.parseResponsesTurn(documented)
  assert.equal(call.stop, 'call')
  assert.equal(call.call.callId, 'call_002')
  assert.deepEqual(call.call.actions, [{ type: 'click', button: 'left', x: 405, y: 157 }, { type: 'type', text: 'penguin' }])
  const first = sut.lib.parseResponsesTurn({ output: [{ type: 'computer_call', call_id: 'call_001', actions: [{ type: 'screenshot' }], status: 'completed' }] })
  assert.deepEqual(first.call.actions, [{ type: 'screenshot' }])
  const checks = [{ id: 'cu_sc_1', code: 'malicious_instructions', message: 'Suspicious instruction on screen.' }]
  const held = sut.lib.parseResponsesTurn({ output: [{ type: 'computer_call', call_id: 'call_003', actions: [{ type: 'click', button: 'left', x: 1, y: 1 }], pending_safety_checks: checks, status: 'completed' }] })
  assert.deepEqual(held.call.pendingSafetyChecks, checks, 'pending safety checks must reach the consent gate')
  const final = sut.lib.parseResponsesTurn({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'The search box holds penguin.' }] }] })
  assert.deepEqual([final.stop, final.message], ['final', 'The search box holds penguin.'])
})
