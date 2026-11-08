/**
 * Run a fixture oracle plan in a real browser: resolve each step against the target boxes the fixture holds
 * for the task, execute the resulting canonical actions with CDP input, and follow a tab the page opens.
 *
 * Judge-side only: it drives a browser-use page handle, never the chrome-browser driver or agent-core
 * (D-012 rule 2).
 */

import { needsTargets, resolveStep } from '../fixture-site/plans.mjs'
import { executeAction } from './cdp-input.mjs'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Bound a promise, so a call to a page that went away fails with its name instead of hanging a check. */
export function withTimeout(promise, ms, label) {
  let timer
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} did not answer within ${ms} ms`)), ms)
    }),
  ])
}

/** The target names a step needs. */
export function targetNames(step) {
  if (step.drag) return [...step.drag]
  for (const key of ['click', 'double_click', 'move', 'scrollTo']) if (step[key]) return [step[key]]
  return []
}

/**
 * Poll the fixture until every named target is reported (a page that just navigated reports a moment
 * later), then return the boxes. Throws after `timeoutMs`, naming what was missing.
 */
export async function waitForTargets(client, taskId, names, { timeoutMs = 5000, intervalMs = 80 } = {}) {
  const deadline = Date.now() + timeoutMs
  let boxes
  for (;;) {
    boxes = await client.targets(taskId)
    const missing = names.filter((name) => !boxes.targets[name])
    if (missing.length === 0) return boxes
    if (Date.now() > deadline) throw new Error(`targets ${missing.join(', ')} were not reported within ${timeoutMs} ms (reported: ${Object.keys(boxes.targets).join(', ') || 'none'})`)
    await sleep(intervalMs)
  }
}

/** Whether a box's centre lies inside the reported viewport; a click outside it hits nothing reliably. */
export function insideViewport(box, viewport) {
  if (!viewport) return true
  return box.cx >= 0 && box.cy >= 0 && box.cx < viewport.width && box.cy < viewport.height
}

/** Poll until the page reports a scroll position other than `before`, so later boxes are post-scroll. */
async function waitForScroll(client, taskId, before, { timeoutMs = 3000, intervalMs = 60 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const boxes = await client.targets(taskId)
    if (boxes.viewport && boxes.viewport.scrollY !== before) return boxes
    await sleep(intervalMs)
  }
  throw new Error(`the page did not report a new scroll position within ${timeoutMs} ms`)
}

/**
 * Execute `steps` for `taskId`. `handle` is browser-use's `openPage` handle; `client` the fixture client.
 * Returns the page that was active at the end (a new tab becomes active, as the driver contract says).
 * `onAction(action, step)` sees each canonical action before it runs, so a harness can record a plan.
 */
export async function runPlan({ handle, client, taskId, steps, secrets = {}, stepPauseMs = 150, log = () => {}, onAction = () => {} }) {
  let active = handle.page
  for (const step of steps) {
    const known = new Set(handle.browser.pages.keys())
    const boxes = needsTargets(step) ? await waitForTargets(client, taskId, targetNames(step)) : null
    for (const name of step.scrollTo || step.drag ? [] : targetNames(step)) {
      if (!insideViewport(boxes.targets[name], boxes.viewport)) throw new Error(`target ${name} is outside the viewport; the plan needs a scrollTo step first`)
    }
    for (const action of resolveStep(step, boxes, { secrets })) {
      log(`${taskId}: ${action.type}${action.x !== undefined ? ` ${action.x},${action.y}` : ''}`)
      onAction(action, step)
      if (action.type === 'navigate') await withTimeout(active.navigate({ url: action.url, timeoutMs: 15_000 }), 20_000, `navigate ${action.url}`)
      else if (action.type === 'dialog') await answerDialog(active, action.accept)
      else await executeAction((method, params) => sendOrDialog(active, method, params), action)
    }
    if (step.scrollTo && boxes.viewport && Math.round(boxes.targets[step.scrollTo].cy - boxes.viewport.height / 2) !== 0) await waitForScroll(client, taskId, boxes.viewport.scrollY)
    await sleep(stepPauseMs)
    const opened = [...handle.browser.pages.keys()].filter((id) => !known.has(id))
    if (opened.length > 0) {
      active = handle.browser.pages.get(Math.max(...opened))
      await sleep(400)
    }
  }
  return active
}

/**
 * Refuse every download in this browser, so no check can write outside its throwaway profile (a default
 * download would land in the user's Downloads folder, which no seat may touch).
 */
export async function denyDownloads(handle) {
  await handle.browser.connection.send('Browser.setDownloadBehavior', { behavior: 'deny' })
}

/**
 * Send one input call, resolving early if a native dialog opens: the call that triggers `confirm()` does not
 * return until the dialog is answered (measured 2026-11-01), so it is raced against the dialog, as the driver does.
 */
export async function sendOrDialog(page, method, params, { timeoutMs = 10_000, pollMs = 50 } = {}) {
  const sent = Promise.resolve(page.send(method, params))
  sent.catch(() => {})
  let timer
  const opened = new Promise((resolve) => {
    const tick = () => (page.dialog ? resolve({ dialog: page.dialog }) : (timer = setTimeout(tick, pollMs)))
    timer = setTimeout(tick, pollMs)
  })
  try {
    return await withTimeout(Promise.race([sent, opened]), timeoutMs, method)
  } finally {
    clearTimeout(timer)
  }
}

/** Answer the page's native dialog once browser-use holds it (it holds, never answers, an ordinary dialog). */
export async function answerDialog(page, accept, { timeoutMs = 3000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (!page.dialog && Date.now() < deadline) await sleep(50)
  if (!page.dialog) throw new Error(`no dialog opened within ${timeoutMs} ms`)
  await withTimeout(page.send('Page.handleJavaScriptDialog', { accept }), 10_000, 'Page.handleJavaScriptDialog')
}

/** Close every page but the handle's own, so each check starts with one tab. */
export async function closeOtherPages(handle) {
  for (const id of [...handle.browser.pages.keys()]) {
    if (id !== handle.page.pageId) await withTimeout(handle.browser.closePage(id), 10_000, `closing page ${id}`).catch(() => {})
  }
}
