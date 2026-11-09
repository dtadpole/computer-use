import { createHash } from 'node:crypto'

import { connect as browserUseConnect } from '../../_vendor_/browser-use/cdp.mjs'
import { createRunClipboard } from './clipboard.mjs'
import { checkPoint, fitScale, frameFor, pngSize, screenshotClip, toFrame, toViewport } from './coords.mjs'
import { EnvironmentError } from './errors.mjs'
import { historyMove } from './input-plan.mjs'
import { clipboardOp, executeAction, NAVIGATION_TIMEOUT_MS, navigateHistory, sendInput, settle } from './executor.mjs'
import { planHumanInput } from './human-input.mjs'
import { processCommandLine, sandboxProblem, SEAT_PATTERN, startChrome } from './launch.mjs'
import { normalizeKey } from './keys.mjs'
import { accessKeyElement, accessKeyOf, activatableAncestor, autofilledFields, clickLabel, closedRootHoldsEntry, collectPageText, deepActiveElement, describeElement, DRAG_TEXT_MAX, dragTextAt, FRAME_FOCUS_EXPRESSION, implicitSubmitButton, selectKeyOption, selectTypeOptions, pageExpression, selectionContainer, textEntered, TWO_FRAMES_EXPRESSION } from './page-scripts.mjs'

/** CU-300: how long focusedElement may spend reading the focus inside a cross-site frame before it keeps the iframe. */
export const FRAME_FOCUS_MS = 2000
import { startProxy } from './proxy.mjs'
import { BrowserSession } from './session.mjs'

/**
 * `launchBrowserEnvironment(options)`: the browser environment driver of
 * `_designs_/system-architecture/environment-driver.md` 0.4.
 *
 * Options: `seat`, `viewport` (default 1440x900, CSS pixels at device scale factor 1), `frame` (the adapter's image
 * limits, any `fitScale` limit), `startUrl`, and from agent-core's `lib.mjs`: `sitePolicy` (`createSitePolicy`),
 * `isFixedDenied` (default `sitePolicy.isFixedDenied`, the run's bound copy with the live-view port), `resourceGate`
 * (the D-014 registry; resolves to a slot) and `control` (`createRunControl`; `signal` defaults to `control.signal`).
 * None of them defaults to allow. Also `navigationTimeoutMs`, `binary`, and test seams `connect`, `startChrome`,
 * `processCommandLine`, `proxyLookup`.
 *
 * Launch order: the resource gate (D-005), the 127.0.0.1 proxy (the network layer for WebSocket and WebRTC; `proxy:
 * false` turns it off for tests), Chrome on a fresh profile, the sandbox check on Chrome's real command line (D-012),
 * the session (`Fetch` filter, pages), the frame from the first captured image, then the start URL. Any failure stops
 * Chrome, closes the proxy and removes the profile before the error is thrown.
 */

const DEFAULT_VIEWPORT = Object.freeze({ width: 1440, height: 900 })

function checkOptions(options) {
  if (typeof options.seat !== 'string' || !SEAT_PATTERN.test(options.seat)) throw new EnvironmentError('invalid_argument', 'seat must be a [cu] seat key')
  for (const name of ['sitePolicy', 'isFixedDenied', 'resourceGate']) {
    if (typeof options[name] !== 'function') throw new EnvironmentError('invalid_argument', `launchBrowserEnvironment needs ${name} from agent-core`)
  }
  const viewport = options.viewport ?? DEFAULT_VIEWPORT
  for (const side of ['width', 'height']) {
    if (!Number.isInteger(viewport[side]) || viewport[side] < 200 || viewport[side] > 4000) {
      throw new EnvironmentError('invalid_argument', 'the viewport needs integer width and height from 200 to 4000')
    }
  }
  return viewport
}

/**
 * Pass agent-core's resource gate (D-005, D-014). It resolves to a slot `{ setChromePid(pid), release() }` or rejects
 * with `ResourceRefusedError { code: 'resource_refused', reason }`; any refusal becomes this driver's
 * `resource_refused`, carrying the reason. A slot without those members is refused rather than trusted.
 */
async function passGate(resourceGate, seat) {
  let slot
  try {
    slot = await resourceGate({ seat })
  } catch (error) {
    throw new EnvironmentError('resource_refused', typeof error?.message === 'string' ? error.message : 'the resource gate refused the launch',
      { reason: error?.reason ?? 'refused' })
  }
  if (slot === null || typeof slot !== 'object' || typeof slot.release !== 'function') {
    throw new EnvironmentError('resource_refused', 'the resource gate did not grant a slot')
  }
  return slot
}

/**
 * CU-265: the scheme of a link's URL, what agent core asks about when it is not a web scheme (facetime:, tel:, zoommtg:,
 * mailto: start another app) - lower case, no colon, the scheme only and never the rest of the URL. Null when there is
 * no URL or it does not parse.
 */
export function linkSchemeOf(url) {
  if (typeof url !== 'string' || url.trim() === '') return null
  let parsed
  try {
    parsed = new URL(url.trim())
  } catch {
    return null
  }
  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase()
  return /^[a-z][a-z0-9+.-]{0,31}$/.test(scheme) ? scheme : null
}

export async function launchBrowserEnvironment(options = {}) {
  const isFixedDenied = options.isFixedDenied ?? options.sitePolicy?.isFixedDenied
  const viewport = checkOptions({ ...options, isFixedDenied })
  const { seat, sitePolicy, control } = options
  const signal = options.signal ?? control?.signal
  const navigationTimeoutMs = options.navigationTimeoutMs ?? NAVIGATION_TIMEOUT_MS
  const connect = options.connect ?? browserUseConnect
  const slot = await passGate(options.resourceGate, seat)
  const release = () => slot.release()
  let running
  let connection
  let session
  let proxy
  const pendingBlocked = []
  const onProxyBlocked = (entry) => (session !== undefined ? session.recordBlocked(entry) : pendingBlocked.push(entry))
  try {
    // `proxyLookup(name)` replaces DNS resolution in the proxy: a test seam, so a live check can make an allowed name
    // resolve to a loopback address without touching the machine's resolver.
    if (options.proxy !== false) proxy = await startProxy({ sitePolicy, isFixedDenied, onBlocked: onProxyBlocked, ...(options.proxyLookup ? { lookup: options.proxyLookup } : {}) })
    running = await (options.startChrome ?? startChrome)({ seat, viewport, binary: options.binary, proxyServer: proxy?.address })
    slot.setChromePid?.(running.child.pid)
    connection = await connect(running.wsUrl)
    // Chrome answers Browser.getBrowserCommandLine only under --enable-automation; the process table is the fallback.
    let commandLine = (await connection.send('Browser.getBrowserCommandLine').catch(() => null))?.result?.arguments
    if (!Array.isArray(commandLine)) commandLine = await (options.processCommandLine ?? processCommandLine)(running.child.pid)
    const problem = sandboxProblem({ commandLine, stderr: running.stderr() })
    if (problem !== null) throw new EnvironmentError('sandbox_unavailable', problem)
    session = new BrowserSession(connection, { viewport, sitePolicy, isFixedDenied })
    for (const entry of pendingBlocked.splice(0)) session.recordBlocked(entry)
    await session.start()
    const env = new BrowserEnvironment({ running, connection, session, proxy, viewport, release, signal, control, navigationTimeoutMs, limits: options.frame ?? {} })
    await env.establishFrame()
    if (options.startUrl !== undefined && options.startUrl !== 'about:blank') {
      const effect = await env.navigate({ url: options.startUrl })
      if (effect.blocked.some((entry) => entry.url === options.startUrl) || effect.navigationError !== undefined) {
        throw new EnvironmentError('blocked_by_policy', 'the start URL was refused by the site filter or failed to load')
      }
    }
    return env
  } catch (error) {
    session?.close()
    if (session === undefined) {
      try { connection?.close() } catch { /* already closed */ }
    }
    await running?.stop()
    await proxy?.close()
    release()
    throw error
  }
}

class BrowserEnvironment {
  constructor({ running, connection, session, proxy, viewport, release, signal, control, navigationTimeoutMs, limits }) {
    this.kind = 'browser'
    this.site = 'browser:chrome-local'
    this.running = running
    this.connection = connection
    this.session = session
    this.proxy = proxy
    this.viewport = Object.freeze({ ...viewport })
    this.release = release
    this.signal = signal
    this.control = control
    this.navigationTimeoutMs = navigationTimeoutMs
    this.limits = limits
    this.clipboard = createRunClipboard()
    this.frame = undefined
    this.lastShot = undefined
    this.screencast = undefined
    this.closed = false
  }

  /** Capture once at the scale the limits allow and build the frame from the image Chrome actually returned. */
  async establishFrame() {
    const scale = fitScale(this.viewport, this.limits)
    const provisional = frameFor(this.viewport, scale)
    const image = await this.#capture(screenshotClip(provisional))
    this.frame = frameFor(this.viewport, scale, pngSize(image))
    const page = this.session.foreground()
    this.lastShot = { data: image, mimeType: 'image/png', ...pngSize(image), url: page.url, title: page.title, takenAt: new Date().toISOString() }
    return this.frame
  }

  on(event, listener) {
    this.session.on(event, listener)
    return this
  }

  #assertOpen() {
    if (this.closed) throw new EnvironmentError('closed', 'the environment is closed')
  }

  async #capture(clip) {
    const page = this.session.foreground()
    if (page.dialog === null) await this.session.evaluate(page, TWO_FRAMES_EXPRESSION, { timeoutMs: 1000 }).catch(() => {})
    const metrics = (await this.session.send(page, 'Page.getLayoutMetrics')).result
    const offsetX = metrics.cssVisualViewport?.pageX ?? 0
    const offsetY = metrics.cssVisualViewport?.pageY ?? 0
    const reply = await this.session.send(page, 'Page.captureScreenshot', {
      format: 'png',
      clip: { ...clip, x: clip.x + offsetX, y: clip.y + offsetY },
      captureBeyondViewport: false,
      fromSurface: true,
    }, { timeoutMs: 15_000 })
    return Buffer.from(reply.result.data, 'base64')
  }

  /**
   * PNG of the viewport at the frame's scale, or a `region` `[x0, y0, x1, y1]` (frame pixels) at full resolution.
   *
   * Measured: while a `confirm`, `prompt` or `beforeunload` dialog is held the renderer is stopped and every capture
   * call hangs, and headless screenshots never show the dialog anyway. So during a held dialog the last frame taken
   * before it is returned, marked `stale`, with the dialog's type and message for the model's text.
   */
  async screenshot({ region } = {}) {
    this.#assertOpen()
    const page = this.session.foreground()
    if (page.dialog !== null) {
      if (this.lastShot === undefined || region !== undefined) throw new EnvironmentError('dialog_open', `a ${page.dialog.type} dialog is open; answer it with keypress ENTER or ESCAPE`)
      // A zoom has no stale equivalent; the refusal names the dialog rule.
      return { ...this.lastShot, stale: true, dialog: { type: page.dialog.type, message: page.dialog.message } }
    }
    const data = await this.#capture(screenshotClip(this.frame, region))
    const { width, height } = pngSize(data)
    const shot = { data, mimeType: 'image/png', width, height, url: page.url, title: page.title, takenAt: new Date().toISOString() }
    if (region === undefined) this.lastShot = shot
    return shot
  }

  /**
   * While a dialog is held the page cannot be read (its renderer is stopped), and the dialog is what any input would
   * answer, so the target is the dialog itself: policy classifies ENTER by its message (design decision 5).
   */
  #dialogTarget(page) {
    const dialog = page.dialog
    let origin = null
    try {
      origin = new URL(dialog.url || page.url).origin
    } catch {
      origin = null
    }
    const fingerprint = createHash('sha256').update(['dialog', dialog.type, dialog.message, dialog.url ?? ''].join('|')).digest('hex').slice(0, 32)
    return {
      tag: 'dialog', role: 'alertdialog', name: dialog.message, dialogType: dialog.type, href: null, inputType: null,
      isPassword: false, autocomplete: null, origin, editable: dialog.type === 'prompt', box: null, fingerprint,
    }
  }

  /** One validated canonical action in frame pixels; resolves to its `ActionEffect`. */
  async perform(action) {
    this.#assertOpen()
    return executeAction(action, {
      session: this.session,
      frame: this.frame,
      clipboard: this.clipboard,
      control: this.control,
      signal: this.signal,
      navigationTimeoutMs: this.navigationTimeoutMs,
      screenshot: (args) => this.screenshot(args),
    })
  }

  /** Synchronous: it reads the session's cached state, as the loop and the fake environment expect. */
  state() {
    this.#assertOpen()
    const page = this.session.foreground()
    return {
      url: page.url,
      title: page.title,
      loading: page.loading,
      tabs: this.session.tabs(),
      dialog: page.dialog === null ? null : { type: page.dialog.type, message: page.dialog.message },
      // CU-153: what reload, back and forward would load, so agent core judges a resend of a submitted form.
      history: this.session.historyMoves(page),
      // CU-155: the page shows one of Chrome's own warning or error pages (a certificate or Safe Browsing warning, a
      // network error), committed as chrome-error:// while `url` stays the attempted URL; agent core hands it off.
      interstitial: page.errorPage !== null,
    }
  }

  /**
   * CU-153: the history move an action makes ('reload', 'back', 'forward') or null - the driver's own chord table.
   * CU-158: a click with the mouse's back or forward button is the same move as Command-[ or Command-] - measured: a
   * click with button 'back' through Input.dispatchMouseEvent moves history in our Chrome - so the resubmit rule judges
   * it too. Only 'click' carries the button (double and triple clicks are planned with the left button).
   */
  historyAction(action) {
    return historyMove(action)
  }

  /**
   * The element at a frame point, for policy and the consent recheck; null on empty space.
   * `DOM.getNodeForLocation` takes document coordinates, so the visual viewport's scroll offset is added (reported by
   * cu-developer-one: on a scrolled page, visible points missed with "No node found"). A point in a cross-site iframe
   * hits the <iframe> element on the page; `#insideFrame` looks inside it.
   */
  async inspectPoint({ x, y }) {
    this.#assertOpen()
    checkPoint({ x, y }, this.frame)
    const page = this.session.foreground()
    if (page.dialog !== null) return this.#dialogTarget(page)
    const point = toViewport({ x, y }, this.frame)
    const located = await this.#locate(page, point)
    if (located === null) return null
    const node = (await this.session.send(page, 'DOM.describeNode', { backendNodeId: located.backendNodeId })).result.node
    const inner = await this.#insideFrame(page, located.backendNodeId, node, point)
    if (inner !== undefined) return inner
    const activating = await this.#activating(page, located.backendNodeId, located.frameId)
    const described = await this.#describe(page, activating.id, located.frameId, { ...(activating.id === located.backendNodeId ? { node } : {}), fallbackName: activating.name })
    return this.#withAutofill(page, activating.id, located.frameId, described)
  }

  /**
   * CU-319 (CU-302's driver half): on a submit-like target, the fields its submit would send that the browser autofilled
   * (see autofilledFields) as `autofilledFields` - descriptors from #describe, never a value - with `autofillRead: true`;
   * absent when none. A failed read on a control or entry is `autofillRead: false, autofilledFields: null`, which agent
   * core asks on a submit (fail closed, as CU-190). No submit-like target: `described` unchanged. Outside the
   * fingerprint, never recorded.
   */
  async #withAutofill(target, backendNodeId, frameId, described) {
    if (described === null || described === undefined) return described
    try {
      const world = await this.session.isolatedContext(target, frameId ?? target.mainFrameId)
      const objectId = (await this.session.send(target, 'DOM.resolveNode', { backendNodeId, executionContextId: world })).result.object.objectId
      const found = (await this.session.send(target, 'Runtime.callFunctionOn', {
        objectId, functionDeclaration: `function () { return (${autofilledFields.toString()})(this) }`, returnByValue: false,
      })).result.result
      if (found?.subtype === 'null' || found?.objectId === undefined) return described
      const part = (name, returnByValue) => this.session.send(target, 'Runtime.callFunctionOn', { objectId: found.objectId, functionDeclaration: `function () { return this.${name} }`, returnByValue })
      // A walk the page's size stopped answers truncated: fail closed rather than trust a partial list (cu-researcher).
      if ((await part('truncated', true)).result.result.value === true) return { ...described, autofillRead: false, autofilledFields: null }
      const edited = (await part('edited', true)).result.result.value
      const list = (await part('fields', false)).result.result
      if (!Array.isArray(edited) || typeof list?.objectId !== 'string') throw new Error('autofill read: no field list')
      const properties = (await this.session.send(target, 'Runtime.getProperties', { objectId: list.objectId, ownProperties: true })).result.result
      const fields = []
      for (const property of properties ?? []) {
        if (!/^\d+$/.test(String(property.name)) || typeof property.value?.objectId !== 'string') continue
        const node = (await this.session.send(target, 'DOM.describeNode', { objectId: property.value.objectId })).result.node
        const field = await this.#describe(target, node.backendNodeId, frameId, { node, scanText: false })
        // An autofilled field the run then edited (Chrome cleared its :autofill) stays reported, marked edited (cu-verifier).
        if (field !== null) fields.push({ tag: field.tag, inputType: field.inputType, name: field.name, autocomplete: field.autocomplete, caption: field.caption, ...(edited[Number(property.name)] === true ? { edited: true } : {}) })
      }
      return fields.length > 0 ? { ...described, autofillRead: true, autofilledFields: fields } : { ...described, autofillRead: true }
    } catch {
      const tag = String(described.tag ?? '')
      const role = String(described.role ?? '').toLowerCase()
      const mayCarry = ['button', 'input', 'textarea', 'a'].includes(tag) || role === 'button' || role === 'link'
      return mayCarry ? { ...described, autofillRead: false, autofilledFields: null } : described
    }
  }

  /**
   * CU-175: what a click on `backendNodeId` activates (see activatableAncestor), as `{ id, name }`: the backend node to
   * judge - so a <span> label or an icon inside a 'Delete' button is judged as the button - and a name for it when the
   * accessibility tree leaves it unnamed (see clickLabel). `{ id: backendNodeId, name: null }` when nothing above it
   * activates or it cannot be read (the frame's world gone): the same answer as before this lookup existed.
   */
  async #activating(target, backendNodeId, frameId) {
    try {
      const world = await this.session.isolatedContext(target, frameId ?? target.mainFrameId)
      const objectId = (await this.session.send(target, 'DOM.resolveNode', { backendNodeId, executionContextId: world })).result.object.objectId
      const found = (await this.session.send(target, 'Runtime.callFunctionOn', {
        objectId, functionDeclaration: `function () { return (${activatableAncestor.toString()})(this) }`, returnByValue: false,
      })).result.result
      if (typeof found?.objectId !== 'string') return { id: backendNodeId, name: null }
      const label = (await this.session.send(target, 'Runtime.callFunctionOn', {
        objectId, functionDeclaration: `function (target) { return (${clickLabel.toString()})(this, target) }`,
        arguments: [{ objectId: found.objectId }], returnByValue: true,
      })).result.result.value
      const node = (await this.session.send(target, 'DOM.describeNode', { objectId: found.objectId })).result.node
      return { id: Number.isInteger(node?.backendNodeId) ? node.backendNodeId : backendNodeId, name: typeof label === 'string' && label !== '' ? label : null }
    } catch {
      return { id: backendNodeId, name: null }
    }
  }

  /**
   * The node at a viewport point of a page or frame session, moved into its document by its own scroll offset;
   * null for "No node found".
   */
  async #locate(target, point) {
    const metrics = (await this.session.send(target, 'Page.getLayoutMetrics')).result
    const scroll = metrics?.cssVisualViewport ?? { pageX: 0, pageY: 0 }
    try {
      return (await this.session.send(target, 'DOM.getNodeForLocation', {
        x: Math.floor(point.x + (scroll.pageX ?? 0)), y: Math.floor(point.y + (scroll.pageY ?? 0)), includeUserAgentShadowDOM: false, ignorePointerEventsNone: true,
      })).result
    } catch (error) {
      if (/no node found/i.test(error.details?.cdpMessage ?? error.message)) return null
      throw error
    }
  }

  /**
   * The element at a viewport point inside a cross-site iframe; undefined when `node` is not one, so the caller
   * describes `node` itself.
   *
   * Such a frame's document lives in another renderer, so the page's hit test stops at its <iframe>; the frame session
   * `session.mjs` keeps for it (`page.frameSessions`, by the frame id `DOM.describeNode` gives the iframe) answers
   * instead. The point moves into the frame's viewport by the iframe's content-box origin (viewport CSS pixels, from
   * the page's box model; an untransformed iframe is assumed), and `#locate` adds the frame's own scroll. The element's
   * box comes back in the frame's viewport and is moved back by the same origin. One level deep only: a cross-site
   * frame inside a cross-site frame resolves to its <iframe> element. A point on the iframe's border or padding, or a
   * frame session that fails (gone, refused), gives the iframe element as before; should that switch fall between a
   * proposal and its consent recheck, the fingerprints differ and the recheck fails closed. "No node found" inside the
   * frame is empty space (null).
   */
  async #insideFrame(page, backendNodeId, node, point) {
    const tag = String(node?.nodeName ?? '').toUpperCase()
    if ((tag !== 'IFRAME' && tag !== 'FRAME') || typeof node.frameId !== 'string') return undefined
    const frame = page.frameSessions?.get(node.frameId)
    if (frame === undefined || (await frame.ready) !== true) return undefined
    try {
      const box = await this.#contentBox(page, backendNodeId)
      const origin = { x: box.x, y: box.y }
      if (point.x < box.x || point.y < box.y || point.x >= box.right || point.y >= box.bottom) return undefined
      const target = await this.#frameTarget(page, frame)
      const located = await this.#locate(target, { x: point.x - origin.x, y: point.y - origin.y })
      if (located === null) return null
      const activating = await this.#activating(target, located.backendNodeId, located.frameId ?? frame.targetId)
      const described = await this.#describe(target, activating.id, located.frameId ?? frame.targetId, { offset: origin, fallbackName: activating.name })
      // CU-319 inside the frame's own world, then CU-300's host facts.
      const withAutofill = await this.#withAutofill(target, activating.id, located.frameId ?? frame.targetId, described)
      return withAutofill === null ? null : { ...withAutofill, frameHost: await this.#hostFacts(page, node) }
    } catch {
      return undefined
    }
  }

  /** An iframe element's content box on `page`, in viewport CSS pixels (untransformed): `{ x, y, right, bottom }`. */
  async #contentBox(page, backendNodeId) {
    const content = (await this.session.send(page, 'DOM.getBoxModel', { backendNodeId })).result.model.content
    const xs = [content[0], content[2], content[4], content[6]]
    const ys = [content[1], content[3], content[5], content[7]]
    return { x: Math.min(...xs), y: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) }
  }

  /**
   * A frame session as a page-like target for `session.send`, `isolatedContext` and `#describe`, with the frame's current
   * loaders (they keep the fingerprint apart across its navigations, as on the page) and a fresh world map, since no Page
   * events reach this session to say when the frame navigated. inspectPoint and focusedElement build it alike, so one
   * field has one fingerprint and one fieldKey from either (CU-300).
   */
  async #frameTarget(page, frame) {
    const target = { sessionId: frame.sessionId, targetId: frame.targetId, mainFrameId: frame.targetId, worlds: new Map(), loaders: new Map(), crashed: page.crashed }
    const walk = (tree) => {
      if (tree?.frame === undefined) return
      target.loaders.set(tree.frame.id, tree.frame.loaderId)
      for (const child of tree.childFrames ?? []) walk(child)
    }
    walk((await this.session.send(target, 'Page.getFrameTree').catch(() => null))?.result?.frameTree)
    return target
  }

  /**
   * CU-300: the host iframe's facts that agent core's frame-host rules read - `{ tag, role, name }` from the page's
   * accessibility tree, role and name null when it cannot be read. Never recorded, outside the fingerprint.
   */
  async #hostFacts(page, node) {
    let role = null
    let name = null
    try {
      const nodes = (await this.session.send(page, 'Accessibility.getPartialAXTree', { backendNodeId: node.backendNodeId, fetchRelatives: false })).result.nodes
      const ax = nodes.find((candidate) => candidate.backendDOMNodeId === node.backendNodeId) ?? nodes[0]
      role = ax?.role?.value ?? null
      name = ax?.name?.value ?? null
    } catch {
      // Unread: role and name stay null.
    }
    return { tag: String(node?.nodeName ?? '').toLowerCase(), role, name }
  }

  /**
   * CU-300 (frame-focus.md): the element focused inside a cross-site iframe, through the frame's own session - the page's
   * focus ends at `node`, an <iframe> whose document lives in another renderer. Undefined (the caller keeps the iframe
   * element, so agent core's frame-host rules judge it, as before) when `node` is no such frame or the read fails: no frame
   * session, one not ready, a protocol error, a read past FRAME_FOCUS_MS, or a frame whose focus is its plain body. One
   * level deep: a cross-site frame inside it is described as its own iframe element. The answer carries `frameHost` and,
   * like every focus, `defaultButton` with `defaultButtonRead` - here read in the frame's own world.
   */
  async #focusInsideFrame(page, node) {
    const tag = String(node?.nodeName ?? '').toUpperCase()
    if ((tag !== 'IFRAME' && tag !== 'FRAME') || typeof node.frameId !== 'string') return undefined
    const frame = page.frameSessions?.get(node.frameId)
    if (frame === undefined) return undefined
    let timer
    const bound = new Promise((resolve) => { timer = setTimeout(() => resolve(undefined), FRAME_FOCUS_MS) })
    try {
      return await Promise.race([this.#readFrameFocus(page, node, frame), bound])
    } catch {
      return undefined
    } finally {
      clearTimeout(timer)
    }
  }

  async #readFrameFocus(page, node, frame) {
    if ((await frame.ready) !== true) return undefined
    const box = await this.#contentBox(page, node.backendNodeId)
    const target = await this.#frameTarget(page, frame)
    let remote = await this.session.evaluate(target, FRAME_FOCUS_EXPRESSION, { returnByValue: false, timeoutMs: FRAME_FOCUS_MS })
    if (remote?.objectId === undefined) {
      // The page already names the frame focused, but the frame's own renderer may not have handled the click that moved
      // the focus there yet (measured in real Chrome: one smoke run in three read the host right after the click). Two of
      // the frame's animation frames, then one more read; still nothing focused inside is the host, as before.
      await this.session.evaluate(target, TWO_FRAMES_EXPRESSION, { timeoutMs: FRAME_FOCUS_MS })
      remote = await this.session.evaluate(target, FRAME_FOCUS_EXPRESSION, { returnByValue: false, timeoutMs: FRAME_FOCUS_MS })
      if (remote?.objectId === undefined) return undefined
    }
    const inner = (await this.session.send(target, 'DOM.describeNode', { objectId: remote.objectId })).result.node
    const host = await this.#hostFacts(page, node)
    // CU-319: a followed entry in a frame's form (a hosted sign-in) carries that form's autofilled fields, read in the
    // frame's own world.
    const described = await this.#withAutofill(target, inner.backendNodeId, frame.targetId,
      await this.#describe(target, inner.backendNodeId, frame.targetId, { node: inner, offset: { x: box.x, y: box.y }, editableBody: true, fallbackName: String(inner.nodeName ?? '').toUpperCase() === 'BODY' ? host.name : null }))
    if (described === null) return undefined
    const submit = await this.#implicitSubmit(target, inner.backendNodeId)
    return { ...described, frameHost: host, defaultButton: submit.button, defaultButtonRead: submit.read }
  }

  /**
   * CU-353: the element a keypress acts on. A Control-Option-<key> chord fires the element whose accesskey is that key
   * (see accessKeyOf), so that element - through activatableAncestor, a label's control included - is the target,
   * described as inspectPoint describes one and marked `accessKey: true`; agent core judges the chord as a press on it.
   * Any other keypress, a chord no element answers, or a lookup that fails: focusedElement(), as before.
   */
  async keyTarget(action) {
    this.#assertOpen()
    const key = accessKeyOf(action)
    const page = this.session.foreground()
    if (key !== null && page.dialog === null) {
      try {
        const world = await this.session.isolatedContext(page, page.mainFrameId)
        const found = (await this.session.send(page, 'Runtime.evaluate', {
          expression: `(${accessKeyElement.toString()})(document, ${JSON.stringify(key)})`, contextId: world, returnByValue: false,
        })).result.result
        if (typeof found?.objectId === 'string') {
          const node = (await this.session.send(page, 'DOM.describeNode', { objectId: found.objectId })).result.node
          const activating = await this.#activating(page, node.backendNodeId, page.mainFrameId)
          const described = await this.#describe(page, activating.id, page.mainFrameId, { fallbackName: activating.name })
          if (described !== null && described !== undefined) return { ...described, accessKey: true }
        }
      } catch {
        // The page's world is gone: the focused element, as before (a named limit).
      }
    }
    const option = page.dialog === null ? await this.#keyOption(page, action).catch(() => undefined) : undefined
    if (option !== undefined) return option
    return this.focusedElement()
  }

  /**
   * CU-370: the main key of a keypress with no modifier but Shift, canonical (keys.mjs), or null.
   */
  static #plainKey(action) {
    if (action?.type !== 'keypress' || !Array.isArray(action.keys)) return null
    let keys
    try {
      keys = action.keys.map((key) => normalizeKey(String(key)))
    } catch {
      return null
    }
    const main = keys.filter((key) => !['Shift', 'Control', 'Alt', 'Meta'].includes(key))
    if (main.length !== 1 || keys.some((key) => ['Control', 'Alt', 'Meta'].includes(key))) return null
    return main[0]
  }

  /**
   * CU-370: a key on a focused native <select> is judged by the option it lands on (selectKeyOption): that option,
   * described, with selectOption: true; Enter or Space, whose popup highlight cannot be read, return the select with
   * optionUnread: true. Enter on an ARIA listbox or combobox answers its aria-activedescendant option (cu-researcher).
   * undefined when none applies - the caller falls back to the focus. The focus is read in the page's world through open
   * shadow roots and same-origin frames (deepActiveElement); a cross-site frame's select is a named limit.
   */
  async #keyOption(page, action) {
    const key = BrowserEnvironment.#plainKey(action)
    if (key === null) return undefined
    const world = await this.session.isolatedContext(page, page.mainFrameId)
    const expression = `(() => {
      const el = (${deepActiveElement.toString()})(document)
      if (!el) return null
      const key = ${JSON.stringify(key)}
      if (String(el.tagName || '').toUpperCase() === 'SELECT') {
        const moved = (${selectKeyOption.toString()})(el, key)
        if (moved === null) return null
        return moved.unread ? 'unread' : el.options[moved.index]
      }
      const role = String(el.getAttribute && el.getAttribute('role') || '').toLowerCase()
      const active = el.getAttribute && el.getAttribute('aria-activedescendant')
      if (key === 'Enter' && (role === 'listbox' || role === 'combobox') && active) {
        const root = el.getRootNode && el.getRootNode()
        return (root && root.getElementById ? root.getElementById(active) : null) || el.ownerDocument.getElementById(active)
      }
      return null
    })()`
    const found = (await this.session.send(page, 'Runtime.evaluate', { expression, contextId: world, returnByValue: false })).result.result
    if (found?.type === 'string' && found.value === 'unread') {
      const focus = await this.focusedElement()
      return focus === null ? undefined : { ...focus, optionUnread: true }
    }
    if (typeof found?.objectId !== 'string') return undefined
    return this.#describeOption(page, found.objectId)
  }

  /** CU-370: an option element, described as a target - its own text the name when the AX tree has none for it. */
  async #describeOption(page, objectId) {
    const node = (await this.session.send(page, 'DOM.describeNode', { objectId })).result.node
    const text = (await this.session.send(page, 'Runtime.callFunctionOn', {
      objectId, functionDeclaration: 'function () { return String(this.label || this.textContent || \'\').replace(/\\s+/g, \' \').trim().slice(0, 200) }', returnByValue: true,
    })).result.result?.value ?? null
    const described = await this.#describe(page, node.backendNodeId, page.mainFrameId, { node, fallbackName: text })
    if (described === null || described === undefined) return undefined
    return { ...described, name: described.name || text, selectOption: true }
  }

  /**
   * CU-370: for a type action whose focus is a native single <select>, every option the typed string moves it through
   * (selectTypeOptions: Chrome's accumulated type-ahead, each step selecting), each described with selectOption: true,
   * in order; [] when nothing matches; null when the focus is no such select (the type is judged as before). Agent core
   * judges each like a click on that option, keeping the strongest class.
   */
  async typeOptions(action) {
    this.#assertOpen()
    if (action?.type !== 'type' || typeof action.text !== 'string') return null
    const page = this.session.foreground()
    if (page.dialog !== null) return null
    try {
      const world = await this.session.isolatedContext(page, page.mainFrameId)
      const expression = `(() => {
        const el = (${deepActiveElement.toString()})(document)
        const indices = (${selectTypeOptions.toString()})(el, ${JSON.stringify(action.text)})
        return indices === null ? null : indices.map((index) => el.options[index])
      })()`
      const found = (await this.session.send(page, 'Runtime.evaluate', { expression, contextId: world, returnByValue: false })).result.result
      if (typeof found?.objectId !== 'string') return null
      const properties = (await this.session.send(page, 'Runtime.getProperties', { objectId: found.objectId, ownProperties: true })).result.result ?? []
      const elements = properties.filter((entry) => /^\d+$/.test(entry.name) && typeof entry.value?.objectId === 'string').sort((a, b) => Number(a.name) - Number(b.name))
      const options = []
      for (const entry of elements) {
        const option = await this.#describeOption(page, entry.value.objectId)
        if (option !== undefined) options.push(option)
      }
      return options
    } catch {
      return null
    }
  }

  /**
   * The focused element (through same-origin frames and open shadow roots, and one cross-site frame through its own
   * session, CU-300), or null. `defaultButtonRead` says whether the default-button read ran (CU-300: a failed one is
   * false, and agent core's CU-190 rule asks the Return as submit).
   */
  async focusedElement() {
    this.#assertOpen()
    const page = this.session.foreground()
    if (page.dialog !== null) return this.#dialogTarget(page)
    const remote = await this.session.evaluate(page, pageExpression(deepActiveElement), { returnByValue: false })
    if (remote?.objectId === undefined) return null
    const node = (await this.session.send(page, 'DOM.describeNode', { objectId: remote.objectId })).result.node
    const inner = await this.#focusInsideFrame(page, node)
    if (inner !== undefined) return inner
    const element = await this.#withAutofill(page, node.backendNodeId, undefined, await this.#describe(page, node.backendNodeId, undefined))
    if (element === null) return null
    const submit = await this.#implicitSubmit(page, node.backendNodeId)
    return { ...element, defaultButton: submit.button, defaultButtonRead: submit.read }
  }

  /**
   * CU-187: the copy source of selected static text - `{ role, tag, origin, caption }` of the element holding the page's
   * selection (see selectionContainer), or null. Never a name: a static text's accessible name is its own words, the
   * value itself (D-060), and its class lives in its caption. A separate method because focusedElement() is null when
   * the focus is the page itself, exactly when static text is selected; agent core reads it only at a copy, so no
   * other action's judgement depends on it. Any failure is null: the copy is judged by its target, as before.
   */
  /**
   * CU-198: the text a drag pressed at (x, y) would carry, for the paste's value rules - read once, returned to the
   * caller and never recorded (the clipboard buffer's contract): a string, or null when no selection lies under the
   * press (or a dialog is up, when nothing can be dragged). A failed read is `{ unknown: true }`, so the policy can ask
   * rather than judge an unread drag as empty (cu-developer-one's CU-196 marker).
   */
  async dragText({ x, y }) {
    this.#assertOpen()
    const page = this.session.foreground()
    if (page.dialog !== null) return null
    try {
      const point = toViewport({ x, y }, this.frame)
      const value = (await this.session.evaluate(page, pageExpression(dragTextAt, point.x, point.y, DRAG_TEXT_MAX))).value
      return typeof value === 'string' && value !== '' ? value : null
    } catch {
      return { unknown: true }
    }
  }

  async selectionSource() {
    this.#assertOpen()
    const page = this.session.foreground()
    if (page.dialog !== null) return null
    try {
      const remote = await this.session.evaluate(page, pageExpression(selectionContainer), { returnByValue: false })
      if (remote?.objectId === undefined) return null
      const node = (await this.session.send(page, 'DOM.describeNode', { objectId: remote.objectId })).result.node
      const described = await this.#describe(page, node.backendNodeId, undefined, { node, scanText: false })
      if (described === null) return null
      return { role: described.role ?? null, tag: described.tag ?? null, origin: described.origin ?? null, caption: described.caption ?? null }
    } catch {
      return null
    }
  }

  /**
   * CU-150: the button a Return in the focused field presses through the form's implicit submission, as
   * `{ role, name, panel: null }` - the same contract as the desktop driver's `defaultButton` (#323), so agent core
   * judges a Return in a checkout's Quantity box by 'Place order' (CU-142's rule) with no policy change. Found in an
   * isolated world, where the page's own scripts cannot redefine the DOM, and described like any target. Null when
   * there is none, and on any failure (a frame this world cannot reach): the Return is then judged by the field's own
   * name, as before. Context, not identity: it stays out of the fingerprint.
   */
  async #implicitSubmit(page, backendNodeId) {
    try {
      const world = await this.session.isolatedContext(page, page.mainFrameId)
      const objectId = (await this.session.send(page, 'DOM.resolveNode', { backendNodeId, executionContextId: world })).result.object.objectId
      const found = (await this.session.send(page, 'Runtime.callFunctionOn', {
        objectId, functionDeclaration: `function () { return (${implicitSubmitButton.toString()})(this) }`, returnByValue: false,
      })).result.result
      if (found?.objectId === undefined) return { button: null, read: true }
      const button = (await this.session.send(page, 'DOM.describeNode', { objectId: found.objectId })).result.node
      const described = await this.#describe(page, button.backendNodeId, undefined, { scanText: false })
      return { button: described === null ? null : { role: described.role, name: described.name, panel: null }, read: true }
    } catch {
      return { button: null, read: false }
    }
  }

  /**
   * CU-157: whether a closed shadow root on the page holds a text entry, through the protocol (DOM.describeNode with
   * pierce reaches closed roots; unlike DOM.getDocument it does not start the DOM agent's tracking). Called only after
   * textEntered said false, so the page is reachable from its main document (a cross-origin frame or ancestor would
   * have made it null). Any failure counts as held: the answer becomes unknown, never false.
   */
  async #closedRootHoldsEntry(page) {
    try {
      const doc = await this.session.evaluate(page, 'document', { returnByValue: false })
      if (doc?.objectId === undefined) return true
      const tree = (await this.session.send(page, 'DOM.describeNode', { objectId: doc.objectId, depth: -1, pierce: true })).result.node
      return closedRootHoldsEntry(tree)
    } catch {
      return true
    }
  }

  /**
   * The facts policy reads about one node of a page or frame session. `node` is its `DOM.describeNode` answer when
   * the caller already has it; `offset` moves a frame session's viewport coordinates into the page's.
   */
  async #describe(page, backendNodeId, frameId, { node, offset = { x: 0, y: 0 }, scanText = true, fallbackName = null, editableBody = false } = {}) {
    node ??= (await this.session.send(page, 'DOM.describeNode', { backendNodeId })).result.node
    const tagName = String(node.nodeName ?? '').toLowerCase()
    // CU-300: a frame's body is described only when the caller allows it and it takes text (an iframe editor).
    const bodyAllowed = editableBody === true && tagName === 'body'
    if (!bodyAllowed && (tagName === 'html' || tagName === 'body' || tagName === '#document')) return null
    const attributes = {}
    for (let index = 0; index + 1 < (node.attributes ?? []).length; index += 2) attributes[node.attributes[index]] = node.attributes[index + 1]
    const inputType = tagName === 'input' ? String(attributes.type ?? 'text').toLowerCase() : null
    let role = null
    let name = null
    try {
      const nodes = (await this.session.send(page, 'Accessibility.getPartialAXTree', { backendNodeId, fetchRelatives: false })).result.nodes
      const ax = nodes.find((candidate) => candidate.backendDOMNodeId === backendNodeId) ?? nodes[0]
      role = ax?.role?.value ?? null
      name = ax?.name?.value ?? null
    } catch {
      // A node without an accessibility object keeps role and name null.
    }
    // CU-175: a click target the accessibility tree leaves unnamed takes the words it shows (see clickLabel).
    if ((name === null || name === '') && typeof fallbackName === 'string' && fallbackName !== '') name = fallbackName
    let extra = {}
    // CU-157: whether the page holds typed text (true/false), or null when it cannot be read; see textEntered.
    let entered = null
    try {
      const world = await this.session.isolatedContext(page, frameId ?? page.mainFrameId)
      const objectId = (await this.session.send(page, 'DOM.resolveNode', { backendNodeId, executionContextId: world })).result.object.objectId
      extra = (await this.session.send(page, 'Runtime.callFunctionOn', {
        objectId, functionDeclaration: `function () { return (${describeElement.toString()})(this) }`, returnByValue: true,
      })).result.result.value ?? {}
      if (scanText) {
        const value = (await this.session.send(page, 'Runtime.callFunctionOn', {
          objectId, functionDeclaration: `function () { return (${textEntered.toString()})(this) }`, returnByValue: true,
        })).result.result.value
        entered = value === true || value === false ? value : null
        // The isolated world cannot see into closed shadow roots; the protocol can. Asked only when the scan said false.
        if (entered === false && (await this.#closedRootHoldsEntry(page))) entered = null
      }
    } catch {
      // A node in a frame this world cannot reach keeps the protocol-side facts only (textEntered stays null: asks).
    }
    if (bodyAllowed && extra.editable !== true) return null
    let box = null
    try {
      const quad = (await this.session.send(page, 'DOM.getBoxModel', { backendNodeId })).result.model.border
      const xs = [quad[0], quad[2], quad[4], quad[6]].map((value) => value + offset.x)
      const ys = [quad[1], quad[3], quad[5], quad[7]].map((value) => value + offset.y)
      const topLeft = toFrame({ x: Math.min(...xs), y: Math.min(...ys) }, this.frame)
      const bottomRight = toFrame({ x: Math.max(...xs), y: Math.max(...ys) }, this.frame)
      box = { x: topLeft.x, y: topLeft.y, width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y }
    } catch {
      // A node without a box (hidden) reports none.
    }
    const frame = frameId ?? page.mainFrameId
    const loaderId = page.loaders.get(frame) ?? ''
    const fingerprint = createHash('sha256').update([loaderId, frame, backendNodeId, role ?? '', name ?? '', tagName, inputType ?? ''].join('|')).digest('hex').slice(0, 32)
    // CU-194: an entry's identity across a password field's show/hide toggle - the node in this target's current
    // document, without the role, name or type the toggle flips - so agent core can remember 'this field was a password
    // field'. Keyed by the session's target and its root loader rather than by frameId, so the click target
    // (inspectPoint, which knows the frame) and the paste destination (focusedElement, which does not) key a same-origin
    // frame's field alike; an out-of-process frame is a target of its own, and backend node ids are never reused within
    // one. Entries only; absent when the root loader is unknown. Outside the fingerprint, never recorded.
    const rootLoader = page.loaders.get(page.mainFrameId)
    const fieldKey = extra.editable === true && typeof rootLoader === 'string' && rootLoader !== ''
      ? createHash('sha256').update(['field', page.targetId, rootLoader, backendNodeId].join('|')).digest('hex').slice(0, 32) : null
    const unnamed = name === null || name === ''
    const href = extra.href ?? attributes.href ?? null
    const captionText = extra.editable === true ? (unnamed ? extra.entryCaption : null) : extra.caption
    return {
      tag: tagName,
      role,
      name,
      href,
      // CU-265: the scheme of the link the element is in (the page script resolves it from the closest <a href>), so a
      // facetime:, tel: or mailto: link is not judged as a plain click. Outside the fingerprint; never recorded.
      linkScheme: linkSchemeOf(href),
      // CU-271: a web terminal, a notebook cell, a notebook or code page - DOM shape only; outside the fingerprint, never
      // recorded.
      ...(extra.terminal === true ? { terminal: true } : {}),
      ...(extra.notebookCell === true ? { notebookCell: true } : {}),
      ...(extra.notebookSurface === true ? { notebookSurface: true } : {}),
      ...(extra.codeSurface === true ? { codeSurface: true } : {}),
      inputType,
      isPassword: inputType === 'password',
      autocomplete: attributes.autocomplete ?? null,
      origin: extra.origin ?? null,
      // CU-300: the frame document's origin and path, inside a frame only; outside the fingerprint, never recorded.
      ...(typeof extra.frameUrl === 'string' && extra.frameUrl !== '' ? { frameUrl: extra.frameUrl } : {}),
      editable: extra.editable ?? null,
      // CU-157: context, not identity - outside the fingerprint.
      textEntered: entered,
      // CU-187: the label that captions a non-entry element (see describeElement); CU-194 rule 5: an entry's structural
      // caption, only while its accessible name is empty. Context too, outside the fingerprint.
      caption: typeof captionText === 'string' && captionText !== '' ? captionText.slice(0, 80) : null,
      box,
      fingerprint,
      ...(fieldKey !== null ? { fieldKey } : {}),
    }
  }

  /** Visible and hidden text of the foreground page for the injection inspector. */
  async pageText({ maxChars = 20000 } = {}) {
    this.#assertOpen()
    const page = this.session.foreground()
    // A held dialog's message is the only content a person sees, and it is untrusted like any page text.
    if (page.dialog !== null) return { text: String(page.dialog.message ?? '').slice(0, maxChars), hiddenText: '', truncated: false, dialog: page.dialog.type }
    const value = (await this.session.evaluate(page, pageExpression(collectPageText, maxChars)))?.value
    return { text: value?.text ?? '', hiddenText: value?.hiddenText ?? '', truncated: value?.truncated === true }
  }

  navigate({ url }) {
    return this.perform({ type: 'navigate', url })
  }

  /**
   * Back, forward or reload for the live view and the dialog rule: a person's controls, so not behind the agent's
   * control gate. The model reaches the same navigations through its own chords (ALT+ARROWLEFT, F5) in `perform`.
   */
  async history({ direction }) {
    this.#assertOpen()
    if (direction !== 'back' && direction !== 'forward') throw new EnvironmentError('invalid_argument', 'history direction is back or forward')
    return this.#humanNavigation(direction)
  }

  async reload() {
    this.#assertOpen()
    return this.#humanNavigation('reload')
  }

  async #humanNavigation(direction) {
    const page = this.session.foreground()
    const epoch = page.loadEpoch
    const urlBefore = page.url
    await navigateHistory(this.session, page, direction)
    await settle(page, epoch, { navigationTimeoutMs: this.navigationTimeoutMs })
    return { navigated: page.url !== urlBefore || page.loadEpoch !== epoch, url: page.url }
  }

  /** Answer the held dialog directly (the live view's path); the model's path is keypress ENTER or ESCAPE. */
  async handleDialog({ accept, promptText }) {
    this.#assertOpen()
    const page = this.session.foreground()
    if (page.dialog === null) throw new EnvironmentError('invalid_argument', 'no dialog is open')
    await this.session.send(page, 'Page.handleJavaScriptDialog', {
      accept: accept === true, ...(accept === true && typeof promptText === 'string' ? { promptText } : {}),
    })
    return { answered: accept === true ? 'accepted' : 'dismissed' }
  }

  /**
   * Stream the foreground page as JPEG frames for the live view (M3): `onFrame({ data, mimeType, metadata, tabId })`,
   * where `metadata.deviceWidth/deviceHeight` are the viewport in CSS pixels. Each frame is acknowledged at once, and
   * the stream follows the foreground when a popup opens or closes. Frames are never recorded by the driver. Returns
   * the stop function; `stopScreencast()` does the same.
   */
  async startScreencast({ onFrame, maxWidth = 960, maxHeight, quality = 60 } = {}) {
    this.#assertOpen()
    if (typeof onFrame !== 'function') throw new EnvironmentError('invalid_argument', 'startScreencast needs onFrame')
    await this.stopScreencast()
    const params = { format: 'jpeg', quality, maxWidth, maxHeight: maxHeight ?? Math.round((maxWidth * this.viewport.height) / this.viewport.width), everyNthFrame: 1 }
    const cast = { page: undefined, removers: [] }
    const begin = async () => {
      const page = this.session.foreground(false)
      if (page === undefined || this.closed) return
      cast.page = page
      await this.session.send(page, 'Page.startScreencast', params).catch(() => {})
    }
    cast.removers.push(this.connection.on('Page.screencastFrame', (frame, message) => {
      if (cast.page === undefined || message?.sessionId !== cast.page.sessionId) return
      void this.session.send(cast.page, 'Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {})
      try {
        onFrame({ data: Buffer.from(frame.data, 'base64'), mimeType: 'image/jpeg', metadata: frame.metadata, tabId: cast.page.targetId })
      } catch {
        // A viewer that throws never stops the stream for the others.
      }
    }))
    const follow = async () => {
      if (cast.page !== undefined && this.session.pages.has(cast.page.sessionId)) {
        await this.session.send(cast.page, 'Page.stopScreencast').catch(() => {})
      }
      await begin()
    }
    this.session.on('foreground', follow)
    cast.removers.push(() => this.session.removeListener('foreground', follow))
    this.screencast = cast
    await begin()
    return () => this.stopScreencast()
  }

  async stopScreencast() {
    const cast = this.screencast
    if (cast === undefined) return
    this.screencast = undefined
    for (const remove of cast.removers) remove()
    if (cast.page !== undefined && !this.closed && this.session.pages.has(cast.page.sessionId)) {
      await this.session.send(cast.page, 'Page.stopScreencast').catch(() => {})
    }
  }

  /**
   * A person's input from the live view, accepted only while `control.humanMayAct()` (take-over), in viewport CSS
   * pixels; see `human-input.mjs` for the event shapes. The network filter applies to the person as to the agent.
   */
  async humanInput(event) {
    this.#assertOpen()
    if (this.control?.humanMayAct?.() !== true) throw new EnvironmentError('unsupported_action', 'human input is accepted only while a person has taken over')
    const page = this.session.foreground()
    const steps = planHumanInput(event, this.viewport)
    for (const step of steps) {
      if (step.method !== undefined) {
        const outcome = await sendInput(this.session, page, step.method, step.params)
        if (outcome.dialog) break
      } else if (step.kind === 'navigate') {
        await navigateHistory(this.session, page, step.direction)
      } else if (step.kind === 'clipboard') {
        await clipboardOp(step.op, { session: this.session, page, clipboard: this.clipboard })
      }
    }
    return { url: this.session.foreground(false)?.url ?? page.url, dialog: page.dialog === null ? null : { type: page.dialog.type, message: page.dialog.message } }
  }

  /** Idempotent: closes the connection, stops Chrome, removes the profile, releases the gate. */
  async close() {
    if (this.closed) return
    await this.stopScreencast().catch(() => {})
    this.closed = true
    try {
      await this.connection.send('Browser.close', {}, { timeoutMs: 2000 })
    } catch {
      // The stop below is the fallback.
    }
    this.session.close()
    await this.running.stop()
    await this.proxy?.close()
    this.release()
  }
}
