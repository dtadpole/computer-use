import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { fixtureClient } from '../../_tools_/fixture-site/client.mjs'
import { judgeRun } from '../../_tools_/fixture-site/judge.mjs'
import { startFixtureServer } from '../../_tools_/fixture-site/server.mjs'
import { startCheckBrowser, stopCheckBrowser } from '../../_tools_/verify-kit/check-browser.mjs'

/**
 * The fixture site judges outcomes from page state, in a real browser.
 *
 * The unit suite proves the server and the evaluators; it cannot prove that a page, driven by mouse
 * and keyboard, reports what a person would see. This check drives each task in headless Chrome with
 * the input a computer-use driver produces - a left click at viewport coordinates and typed text, sent
 * through the DevTools Input domain - and reads only the state endpoint to judge. Each claim is also
 * shown failing: no action, a partial action, or an action undone leaves the outcome false.
 *
 * Surface: headless, 1024x768, a throwaway profile under /tmp/cu-verifier-chrome-*, started through the
 * D-014 registry and the D-005 memory gate. A closed gate or a missing Chrome is unjudged (exit 3), never a pass.
 */

let ready = false
let unjudged = 'the check browser was not started'
let browser

let fixture
let client
let page

before(async () => {
  browser = await startCheckBrowser()
  if (!browser.ready) {
    unjudged = browser.reason
    return
  }
  page = browser.handle
  fixture = await startFixtureServer({ seed: 'fixture-site-verifier' })
  client = fixtureClient(fixture)
  ready = true
})

after(async () => {
  await stopCheckBrowser(browser)
  await fixture?.close()
})

/** The viewport centre of the first element matching `selector`. */
async function centreOf(selector) {
  const point = await page.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) return null
    const box = element.getBoundingClientRect()
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
  })()`)
  assert.ok(point, `no element matches ${selector}`)
  return point
}

/** A computer-use `click`: move, press and release the left button at viewport coordinates. */
async function click({ x, y }) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}

/** A computer-use `type`: text into whatever has focus. */
async function type(text) {
  await page.send('Input.insertText', { text })
}

/** Open a task's start page and return its judged state once the page has reported. */
async function start(id) {
  const { tasks } = await client.tasks()
  const task = tasks.find((candidate) => candidate.id === id)
  await page.goto(task.url)
  return client.settle(id)
}

test('pickup-details: closed until the summary is clicked; the state follows the page', async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  await client.reset()
  let state = await start('pickup-details')
  assert.ok(state.reports >= 1, 'the page never reported, so its script did not run')
  assert.equal(state.outcome, false, 'outcome holds before any action')

  await click(await centreOf('h1'))
  state = await client.settle('pickup-details')
  assert.equal(state.outcome, false, 'a click beside the control opened the details')

  await click(await centreOf('summary'))
  state = await client.settle('pickup-details')
  assert.equal(state.outcome, true, state.reason)
  assert.equal(await page.evaluate("document.getElementById('pickup').open"), true, 'state and DOM disagree')

  const shown = await page.evaluate("document.getElementById('pickup-info').innerText")
  assert.equal(judgeRun(state, { finalAnswer: shown, claimedDone: true }).verdict, 'pass', `answer judged from ${JSON.stringify(shown)}`)
  assert.equal(judgeRun(state, { finalAnswer: 'Locker 18. Pickup code: 6249.', claimedDone: true }).verdict, 'wrong-answer', 'the documented values passed')

  state = await start('pickup-details')
  assert.equal(state.outcome, false, 'a reloaded page kept the old outcome')
})

test('visitor-badge: typing alone is not enough; clicking Create badge creates one server record', async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  await client.reset()
  let state = await start('visitor-badge')
  assert.equal(state.outcome, false)
  assert.equal(state.reason, 'no badge was created')

  await click(await centreOf('#name'))
  await type('Mira')
  state = await client.settle('visitor-badge')
  assert.equal(state.outcome, false)
  assert.equal(state.reason, 'the name Mira was typed but Create badge was not clicked')

  await click(await centreOf('#save'))
  assert.equal(await page.waitFor("location.search.includes('created=')", 10_000), true, 'the form did not submit')
  state = await client.settle('visitor-badge')
  assert.equal(state.outcome, true, state.reason)
  assert.equal(state.facts.records.length, 1)
  assert.equal(await page.evaluate("document.getElementById('result').innerText"), 'Badge ready: Mira')
})

test('filters-search: needs the panel open and penguin typed; closing the panel undoes it', async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  await client.reset()
  let state = await start('filters-search')
  assert.equal(state.outcome, false)
  assert.equal(state.facts.page.filtersOpen, false, 'the panel must start closed')

  await click(await centreOf('#search'))
  await type('penguin')
  state = await client.settle('filters-search')
  assert.equal(state.outcome, false)
  assert.equal(state.reason, 'the search box holds the query but the Filters panel is closed')

  await click(await centreOf('#toggle-filters'))
  state = await client.settle('filters-search')
  assert.equal(state.outcome, true, state.reason)
  const visible = await page.evaluate("[...document.querySelectorAll('#results li')].filter((row) => !row.hidden).map((row) => row.textContent)")
  assert.deepEqual(visible, ['Adelie penguin', 'Emperor penguin', 'Gentoo penguin'], 'the list does not show what the search says')
  assert.equal(await page.evaluate("document.getElementById('toggle-filters').textContent"), 'Hide filters')

  await click(await centreOf('#toggle-filters'))
  state = await client.settle('filters-search')
  assert.equal(state.outcome, false, 'closing the panel again left the outcome holding')
})
