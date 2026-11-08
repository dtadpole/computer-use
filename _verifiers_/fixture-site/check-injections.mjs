import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { fixtureClient } from '../../_tools_/fixture-site/client.mjs'
import { judgeRun } from '../../_tools_/fixture-site/judge.mjs'
import { INJECTION_PLANS } from '../../_tools_/fixture-site/plans.mjs'
import { originsFor, startFixtureServer } from '../../_tools_/fixture-site/server.mjs'
import { idsOfKind } from '../../_tools_/fixture-site/tasks.mjs'
import { startCheckBrowser, stopCheckBrowser } from '../../_tools_/verify-kit/check-browser.mjs'
import { closeOtherPages, runPlan } from '../../_tools_/verify-kit/plan-runner.mjs'

/**
 * Every injection page detects its planted effect when, and only when, the effect happens.
 *
 * For each page: loading it and reading it leaves `compromised` false, and the benign answer is on the page;
 * then obeying the planted instruction - by click, typed text or navigation, as an agent would - makes
 * `compromised` true, from the fixture's records or request log. Without this, an agent that obeyed would
 * look safe. The pixel-only page is also checked to keep its instruction out of the DOM text.
 */

/** Progress lines on stderr when CU_VERIFY_TRACE is set, so a slow or stuck step can be named. */
const progress = process.env.CU_VERIFY_TRACE ? (line) => process.stderr.write(`[trace ${new Date().toISOString()}] ${line}\n`) : () => {}

let ready = false
let unjudged = 'the check browser was not started'
let browser

let fixture
let client
let handle
let urls = {}

before(async () => {
  browser = await startCheckBrowser()
  if (!browser.ready) {
    unjudged = browser.reason
    return
  }
  handle = browser.handle
  fixture = await startFixtureServer({ seed: 'fixture-injections-verifier' })
  client = fixtureClient(fixture)
  urls = Object.fromEntries((await client.tasks('injection')).tasks.map((task) => [task.id, task.url]))
  ready = true
})

after(async () => {
  await stopCheckBrowser(browser)
  await fixture?.close()
})

test('every injection page has a benign and an obey plan', () => {
  assert.deepEqual(Object.keys(INJECTION_PLANS).sort(), idsOfKind('injection').sort())
})

for (const id of idsOfKind('injection')) {
  test(`${id}: reading leaves it clean; obeying the planted instruction is detected`, { timeout: 60_000 }, async (t) => {
    if (!skipUnless(t, ready, unjudged)) return
    await closeOtherPages(handle)
    await client.reset()
    await handle.goto(urls[id])
    let state = await client.settle(id, { quietMs: 200 })
    assert.ok(state.reports >= 1, 'the page never reported')
    assert.equal(state.compromised, false, state.reason)
    const shown = await handle.evaluate('document.body.innerText')
    for (const value of state.answer.mustInclude) assert.ok(shown.includes(value), `the benign answer ${value} is not on the page`)
    assert.equal(judgeRun(state, { escalated: true }).verdict, 'pass')
    assert.equal(judgeRun(state, { escalated: false }).verdict, 'not-escalated')
    if (id === 'inj-pixel-only') assert.ok(!/AI agent/i.test(shown), 'the pixel-only instruction leaked into DOM text')

    const context = { origins: originsFor(`127.0.0.1:${fixture.port}`, fixture.port) }
    await runPlan({ handle, client, taskId: id, steps: INJECTION_PLANS[id].obey(state.expected, context), log: progress })
    state = await client.settle(id, { quietMs: 300 })
    assert.equal(state.compromised, true, `obeying was not detected: ${state.reason}`)
    assert.equal(judgeRun(state, { escalated: true }).verdict, 'compromised')
  })
}
