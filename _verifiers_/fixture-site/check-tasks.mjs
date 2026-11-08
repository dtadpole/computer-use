import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { fixtureClient } from '../../_tools_/fixture-site/client.mjs'
import { judgeRun } from '../../_tools_/fixture-site/judge.mjs'
import { TASK_PLANS } from '../../_tools_/fixture-site/plans.mjs'
import { startFixtureServer } from '../../_tools_/fixture-site/server.mjs'
import { idsOfKind } from '../../_tools_/fixture-site/tasks.mjs'
import { startCheckBrowser, stopCheckBrowser } from '../../_tools_/verify-kit/check-browser.mjs'
import { closeOtherPages, runPlan } from '../../_tools_/verify-kit/plan-runner.mjs'

/**
 * Every fixture task is completable by mouse and keyboard alone, and only its outcome endpoint says so.
 *
 * For each task: a fresh state, the start page, a check that the outcome does not hold yet, then the task's
 * oracle plan executed as canonical actions through CDP input, and a check that the outcome holds. The plan
 * resolves its targets from the boxes the page reported, so a page that drifted fails here first. Answer
 * tasks are checked to show the expected value on the page, so the question is answerable.
 *
 * Surface: headless, 1024x768, a throwaway profile under /tmp/cu-verifier-chrome-*, started through the
 * D-014 registry and the D-005 memory gate. A closed gate or a missing Chrome is unjudged (exit 3), never a pass.
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
  fixture = await startFixtureServer({ seed: 'fixture-tasks-verifier' })
  client = fixtureClient(fixture)
  urls = Object.fromEntries((await client.tasks('task')).tasks.map((task) => [task.id, task.url]))
  ready = true
})

after(async () => {
  await stopCheckBrowser(browser)
  await fixture?.close()
})

test('every task has an oracle plan, and every plan a task', () => {
  assert.deepEqual(Object.keys(TASK_PLANS).sort(), idsOfKind('task').sort())
})

for (const id of idsOfKind('task')) {
  test(`${id}: the oracle plan makes the outcome hold, read only from the state endpoint`, { timeout: 60_000 }, async (t) => {
    if (!skipUnless(t, ready, unjudged)) return
    await closeOtherPages(handle)
    await client.reset()
    await handle.goto(urls[id])
    let state = await client.settle(id, { quietMs: 200 })
    const steps = TASK_PLANS[id](state.expected, {})
    const answerOnly = steps.length === 0
    assert.equal(state.outcome, answerOnly, `before any action: ${state.reason}`)
    const secrets = await client.secrets(id)
    const active = await runPlan({ handle, client, taskId: id, steps, secrets, log: progress })
    state = await client.settle(id, { quietMs: 300 })
    assert.equal(state.outcome, true, state.reason)
    if (state.answer) {
      const shownText = await active.evaluate('document.body.innerText')
      for (const value of state.answer.mustInclude) assert.ok(shownText.includes(value), `the answer value ${value} is not on the page`)
    }
    if (id === 'table-lookup') {
      const { extensions, person } = state.expected
      const shown = await active.evaluate(`[...document.querySelectorAll('tbody tr')][${person}].cells[2].textContent`)
      assert.equal(shown, extensions[person], 'the page does not show the expected answer for the asked name')
      assert.equal(judgeRun(state, { finalAnswer: `The extension is ${shown}.`, claimedDone: true }).verdict, 'pass')
    }
    if (id === 'sign-in') {
      assert.ok(!JSON.stringify(await client.state()).includes(secrets.staff_password), 'the password reached the state endpoint')
    }
  })
}
