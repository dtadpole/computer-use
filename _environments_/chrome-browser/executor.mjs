import { READ_SELECTION_EXPRESSION } from './clipboard.mjs'
import { EnvironmentError } from './errors.mjs'
import { planAction, planKeypress } from './input-plan.mjs'
import { normalizeKey } from './keys.mjs'
import { TWO_FRAMES_EXPRESSION } from './page-scripts.mjs'

/**
 * Executing one canonical action on the foreground page and reporting what it did.
 *
 * Order for every action: the run-control gate (`taken_over`), the run signal (`cancelled`), the held-dialog rule
 * (`dialog_open`), planning (which re-validates and refuses by name), the steps, then the settle: 60 ms, and a
 * navigation the action started awaited up to `navigationTimeoutMs`. The result is an `ActionEffect`
 * `{ navigated, url, blocked, popup, dialog }`, plus `clipboard: { op, length }` or `image` where relevant.
 *
 * A mouse or key event that opens a dialog leaves its own protocol call unanswered while the renderer waits, so
 * input calls are raced against the page's dialog signal and the action stops there, reporting the dialog.
 */

export const SETTLE_MS = 60
export const NAVIGATION_TIMEOUT_MS = 5000
const INPUT_CALL_TIMEOUT_MS = 5000

function abortable(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new EnvironmentError('cancelled', 'the run was cancelled'))
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new EnvironmentError('cancelled', 'the run was cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function checkGates({ control, signal }) {
  if (signal?.aborted) throw new EnvironmentError('cancelled', 'the run was cancelled')
  if (control !== undefined && control !== null && control.agentMayAct() !== true) {
    if (control.state === 'finished') throw new EnvironmentError('cancelled', 'the run was stopped')
    throw new EnvironmentError('taken_over', `the run is ${control.state ?? 'not running'}; the agent sends no input`)
  }
}

/** Send one input call; resolves `{ dialog: true }` if the page opens a dialog before the call answers. */
export async function sendInput(session, page, method, params) {
  const sent = session.send(page, method, params, { timeoutMs: INPUT_CALL_TIMEOUT_MS }).then(() => ({ dialog: false }), () => ({ dialog: false }))
  return Promise.race([sent, session.dialogOpened(page).then(() => ({ dialog: true }))])
}

/** The held-dialog rule: ENTER accepts, ESCAPE dismisses, `type` fills a prompt; anything else is refused. */
async function answerHeldDialog(action, session, page) {
  const dialog = page.dialog
  if (action.type === 'screenshot' || action.type === 'wait') return null
  if (action.type === 'type') {
    if (dialog.type !== 'prompt') throw new EnvironmentError('dialog_open', `a ${dialog.type} dialog is open; answer it with keypress ENTER or ESCAPE`)
    dialog.promptText = String(action.text ?? '')
    return { dialog: { type: dialog.type, message: dialog.message }, promptTextLength: dialog.promptText.length }
  }
  if (action.type === 'keypress' && Array.isArray(action.keys) && action.keys.length === 1) {
    const key = normalizeKey(action.keys[0])
    if (key === 'Enter' || key === 'Escape') {
      const accept = key === 'Enter'
      await session.send(page, 'Page.handleJavaScriptDialog', {
        accept,
        ...(accept && dialog.type === 'prompt' ? { promptText: dialog.promptText ?? dialog.defaultPrompt ?? '' } : {}),
      })
      return { dialogAnswered: { type: dialog.type, message: dialog.message, answered: accept ? 'accepted' : 'dismissed' } }
    }
  }
  throw new EnvironmentError('dialog_open', `a ${dialog.type} dialog is open; answer it with keypress ENTER or ESCAPE`)
}

/** Back, forward or reload on a page; refuses when there is no entry in that direction. */
export async function navigateHistory(session, page, direction) {
  if (direction === 'reload') {
    await session.send(page, 'Page.reload', {})
    return
  }
  const history = (await session.send(page, 'Page.getNavigationHistory', {})).result
  const index = history.currentIndex + (direction === 'back' ? -1 : 1)
  if (index < 0 || index >= history.entries.length) throw new EnvironmentError('invalid_argument', `there is no page to go ${direction} to`)
  await session.send(page, 'Page.navigateToHistoryEntry', { entryId: history.entries[index].id })
}

export async function clipboardOp(op, { session, page, clipboard }) {
  if (op === 'paste') {
    const text = clipboard.get()
    if (text.length > 0) await sendInput(session, page, 'Input.insertText', { text })
    return { op, length: text.length }
  }
  const reading = (await session.evaluate(page, READ_SELECTION_EXPRESSION))?.value ?? { text: '' }
  const text = String(reading.text ?? '')
  clipboard.set(text)
  if (op === 'cut' && text.length > 0 && reading.editable === true) {
    for (const step of planKeypress({ keys: ['BACKSPACE'] })) await sendInput(session, page, step.method, step.params)
  }
  return { op, length: text.length }
}

/** Wait out what the action started: a short settle, then a started navigation up to the timeout. */
/** Wait for two animation frames in the page, at most `timeoutMs`; never during a held dialog. */
export async function frames(session, page, timeoutMs = 1000) {
  if (page.dialog !== null) return
  await Promise.race([
    session.evaluate(page, TWO_FRAMES_EXPRESSION, { awaitPromise: true, timeoutMs }).catch(() => {}),
    session.dialogOpened(page),
  ])
}

export async function settle(page, epochBefore, { signal, settleMs = SETTLE_MS, navigationTimeoutMs = NAVIGATION_TIMEOUT_MS }) {
  await abortable(settleMs, signal)
  if (page.loadEpoch === epochBefore && !page.loading) return
  const deadline = Date.now() + navigationTimeoutMs
  while (page.loading && Date.now() < deadline && page.dialog === null) await abortable(50, signal)
}

/**
 * Perform one action. `ctx` is `{ session, frame, clipboard, control, signal, screenshot, navigationTimeoutMs }`;
 * `screenshot({ region })` serves `zoom`.
 */
export async function executeAction(action, ctx) {
  const { session, frame, clipboard, signal } = ctx
  checkGates(ctx)
  const page = session.foreground()
  if (page.crashed) throw new EnvironmentError('browser_crashed', 'the page crashed')
  const urlBefore = page.url
  const epochBefore = page.loadEpoch
  const blockedBefore = session.blocked.length
  const foregroundBefore = session.foregroundId
  const effect = {}
  if (page.dialog !== null) {
    const answered = await answerHeldDialog(action, session, page)
    if (answered !== null) {
      Object.assign(effect, answered)
      await settle(page, epochBefore, { ...ctx, signal })
      return finish(effect, { session, page, urlBefore, epochBefore, blockedBefore, foregroundBefore })
    }
  }
  const steps = planAction(action, frame)
  let acted = false
  for (const step of steps) {
    checkGates(ctx)
    if (step.method !== undefined) {
      acted = true
      // Measured (1 smoke run in 7): a wheel sent just after an auto-accepted alert sometimes left scrollY at 0 when
      // read 60 ms later. Wheel scrolling lands on the compositor and reaches the page a frame later, so a wheel waits
      // for two page frames before and after it (bounded; skipped while a dialog is held).
      const wheel = step.params?.type === 'mouseWheel'
      if (wheel) await frames(session, page)
      const outcome = await sendInput(session, page, step.method, step.params)
      if (outcome.dialog) break
      if (wheel) await frames(session, page)
    } else if (step.kind === 'navigate') {
      acted = true
      if (step.url !== undefined) {
        const reply = await Promise.race([
          session.send(page, 'Page.navigate', { url: step.url }, { timeoutMs: (ctx.navigationTimeoutMs ?? NAVIGATION_TIMEOUT_MS) + 5000 }),
          session.dialogOpened(page).then(() => ({ result: {} })),
        ])
        if (reply.result?.errorText !== undefined) effect.navigationError = reply.result.errorText
      } else {
        await navigateHistory(session, page, step.direction)
      }
    } else if (step.kind === 'sleep') {
      await abortable(step.ms, signal)
    } else if (step.kind === 'clipboard') {
      acted = true
      effect.clipboard = await clipboardOp(step.op, { session, page, clipboard })
    } else if (step.kind === 'zoom') {
      // The loop captures a zoom with screenshot({ region }); perform only records it, never image bytes.
      effect.zoom = { region: step.region }
    }
    // `screenshot` needs no step: the loop captures after the batch.
  }
  if (acted) await settle(page, epochBefore, { ...ctx, signal })
  if (session.foregroundId !== foregroundBefore) await settlePopup(session.foreground(false), { ...ctx, signal })
  return finish(effect, { session, page, urlBefore, epochBefore, blockedBefore, foregroundBefore })
}

/** A popup starts on about:blank and navigates after it is set up: wait for its first load, bounded. */
async function settlePopup(popup, { signal, navigationTimeoutMs = NAVIGATION_TIMEOUT_MS }) {
  if (popup === undefined) return
  try {
    await popup.ready
  } catch {
    return
  }
  const deadline = Date.now() + navigationTimeoutMs
  while ((popup.loadEpoch === 0 || popup.loading) && Date.now() < deadline && popup.dialog === null) await abortable(50, signal)
}

/**
 * The `ActionEffect`: `dialog` is a dialog still held after the action (the loop tells the model to answer it);
 * an answered one is `dialogAnswered`; `popup` is `{ tabId, url }` of a page that became the foreground.
 */
function finish(effect, { session, page, urlBefore, epochBefore, blockedBefore, foregroundBefore }) {
  const foreground = session.foreground(false)
  const popup = session.foregroundId !== foregroundBefore && foreground !== undefined ? { tabId: foreground.targetId, url: foreground.url } : null
  const held = (foreground ?? page).dialog
  return {
    navigated: page.url !== urlBefore || page.loadEpoch !== epochBefore,
    url: foreground?.url ?? page.url,
    blocked: session.blocked.slice(blockedBefore).map(({ url, rule }) => ({ url, rule })),
    popup,
    dialog: held !== null ? { type: held.type, message: held.message } : null,
    ...(effect.dialogAnswered !== undefined ? { dialogAnswered: effect.dialogAnswered } : {}),
    ...(effect.promptTextLength !== undefined ? { promptTextLength: effect.promptTextLength } : {}),
    ...(effect.clipboard !== undefined ? { clipboard: effect.clipboard } : {}),
    ...(effect.zoom !== undefined ? { zoom: effect.zoom } : {}),
    ...(effect.navigationError !== undefined ? { navigationError: effect.navigationError } : {}),
  }
}
