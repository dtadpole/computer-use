import { EventEmitter } from 'node:events'

import { EnvironmentError } from './errors.mjs'
import { createRequestHandler } from './network.mjs'

/**
 * One CDP connection to the agent's Chrome, and the pages in it.
 *
 * - **Network.** One browser-level `Fetch` handler decides every request of every tab (`network.mjs`); downloads are
 *   denied at the browser level.
 * - **Pages.** Auto-attach with `waitForDebuggerOnStart` pauses every new page until it has the declared viewport
 *   (device scale factor 1), file-chooser interception and dialog handling; only then does it run.
 * - **Foreground.** The page the agent sees and acts on. A popup (a page with an opener) becomes the foreground and
 *   is reported; when the foreground closes, its opener or the last remaining page takes over.
 * - **Cross-site iframes.** Each page auto-attaches its out-of-process iframes as frame sessions, kept on the page by
 *   frame id for `inspectPoint`; they are never pages (no foreground, no popup, no tab).
 * - **Dialogs.** `alert` is accepted and recorded; `confirm`, `prompt` and `beforeunload` are held on the page until
 *   answered (design 0.4, decision 5).
 * - **Isolated worlds.** Page scripts run in a world of their own per frame, recreated after a navigation.
 */
/** CU-153: two URLs name the same document - equal once their fragments are dropped. */
function sameDocument(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  return a.split('#')[0] === b.split('#')[0]
}

export class BrowserSession extends EventEmitter {
  constructor(connection, { viewport, sitePolicy, isFixedDenied }) {
    super()
    this.connection = connection
    this.viewport = viewport
    this.sitePolicy = sitePolicy
    this.isFixedDenied = isFixedDenied
    /** Pages by CDP session id. */
    this.pages = new Map()
    this.foregroundId = undefined
    /** Every request the network layer refused, in order; executors slice it per action. */
    this.blocked = []
    /** Notices for the trajectory: accepted alerts, refused downloads and file choosers. */
    this.notices = []
    this.closed = false
  }

  /** Browser-level setup, then wait for the first page. */
  async start({ timeoutMs = 10_000 } = {}) {
    const conn = this.connection
    const handler = createRequestHandler({
      send: (method, params) => conn.send(method, params, { timeoutMs: 10_000 }),
      sitePolicy: this.sitePolicy,
      isFixedDenied: this.isFixedDenied,
      isPageFrame: (frameId) => this.isPageFrame(frameId),
      onBlocked: (entry) => this.recordBlocked(entry),
    })
    conn.on('Fetch.requestPaused', (params, message) => {
      if (message?.sessionId !== undefined) return
      void handler(params)
    })
    conn.on('Target.attachedToTarget', (params, message) => {
      // Never the EventEmitter 'error' event: unheard, it would throw. A page that fails set-up is reported instead.
      // `message.sessionId` is the page whose own auto-attach brought the target (a cross-site iframe), else undefined.
      void this.#attached(params, message?.sessionId).catch((error) => {
        const notice = { kind: 'page_setup_failed', message: String(error?.message ?? error), at: Date.now() }
        this.notices.push(notice)
        this.emit('notice', notice)
      })
    })
    conn.on('Target.detachedFromTarget', (params) => this.#detached(params))
    conn.on('Target.targetInfoChanged', ({ targetInfo }) => {
      const page = [...this.pages.values()].find((candidate) => candidate.targetId === targetInfo?.targetId)
      if (page === undefined) return
      if (typeof targetInfo.url === 'string' && targetInfo.url.length > 0) page.url = targetInfo.url
      if (typeof targetInfo.title === 'string') page.title = targetInfo.title
    })
    conn.on('Browser.downloadWillBegin', (params) => {
      const notice = { kind: 'download_refused', url: params?.url, at: Date.now() }
      this.notices.push(notice)
      this.emit('download', notice)
    })
    await conn.send('Browser.setDownloadBehavior', { behavior: 'deny', eventsEnabled: true })
    await conn.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] })
    await conn.send('Target.setDiscoverTargets', { discover: true })
    await conn.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: [{ type: 'page' }] })
    const deadline = Date.now() + timeoutMs
    while (this.foreground(false) === undefined && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20))
    const page = this.foreground(false)
    if (page === undefined) throw new EnvironmentError('browser_crashed', 'Chrome exposed no page')
    await page.ready
    return this
  }

  /**
   * Record one refused request for the action effects and the trajectory.
   *
   * Every page HTTP(S) request is judged by `Fetch` first, so a refusal from the proxy is either a page's WebSocket
   * or Chrome's own background traffic (measured: update checks, clock sync, google.com pre-connects). A proxy refusal
   * whose host and port match a WebSocket an open page created (`Network.webSocketCreated`, the page's last 50) is the
   * page's and goes into `blocked` under that WebSocket's URL - for the page's lifetime, so a socket the page opened
   * long before its refused reconnect still claims it (cu-researcher's #339 corner); any other is a
   * `browser_traffic_blocked` notice.
   */
  recordBlocked(entry) {
    const at = entry.at ?? Date.now()
    // A DNS refusal only follows an allowed name, so it is the page's traffic, never Chrome's own background requests.
    if (entry.via === 'proxy' && !String(entry.rule).startsWith('dns_')) {
      const socket = this.#pageWebSocket(entry.url, at)
      if (socket === undefined) {
        const notice = { kind: 'browser_traffic_blocked', url: entry.url, rule: entry.rule, at }
        this.notices.push(notice)
        this.emit('notice', notice)
        return
      }
      entry = { ...entry, url: socket.url }
    }
    const record = { ...entry, at }
    this.blocked.push(record)
    this.emit('blocked', record)
  }

  #pageWebSocket(url, at) {
    let target
    try {
      target = new URL(url)
    } catch {
      return undefined
    }
    const port = (parsed) => parsed.port || ({ 'http:': '80', 'ws:': '80', 'https:': '443', 'wss:': '443' })[parsed.protocol]
    for (const page of this.pages.values()) {
      const socket = page.webSockets.findLast((candidate) => {
        if (candidate.at > at) return false
        try {
          const parsed = new URL(candidate.url)
          return parsed.hostname === target.hostname && port(parsed) === port(target)
        } catch {
          return false
        }
      })
      if (socket !== undefined) return socket
    }
    return undefined
  }

  /** Whether a frame belongs to one of the pages (Chrome's component extensions' frames do not). */
  isPageFrame(frameId) {
    if (frameId === undefined) return true
    for (const page of this.pages.values()) if (page.frames.has(frameId)) return true
    return false
  }

  /** The foreground page; throws `browser_crashed` when there is none (unless `strict` is false). */
  foreground(strict = true) {
    const page = this.foregroundId === undefined ? undefined : this.pages.get(this.foregroundId)
    if (page === undefined && strict) throw new EnvironmentError('browser_crashed', 'no page is open in the browser')
    return page
  }

  tabs() {
    return [...this.pages.values()].map((page) => ({ id: page.targetId, url: page.url, title: page.title, active: page.sessionId === this.foregroundId }))
  }

  /**
   * A protocol call on one page's session. A failure comes back as an EnvironmentError with a string code (asked by
   * cu-developer-one; a raw -32000 reached the loop): `timeout`, `browser_crashed`, `closed`, otherwise
   * `unsupported_action`, with the CDP method, code and message in `details`.
   */
  send(page, method, params = {}, { timeoutMs = 15_000 } = {}) {
    if (this.closed) return Promise.reject(new EnvironmentError('closed', 'the environment is closed'))
    return this.connection.send(method, params, { sessionId: page.sessionId, timeoutMs }).catch((error) => {
      throw protocolError(error, method, page, this.closed)
    })
  }

  /** The execution context of this driver's isolated world in a frame of the page, created on first use. */
  async isolatedContext(page, frameId = page.mainFrameId) {
    const cached = page.worlds.get(frameId)
    if (cached !== undefined) return cached
    const reply = await this.send(page, 'Page.createIsolatedWorld', { frameId, worldName: 'cu-driver', grantUniveralAccess: false })
    const contextId = reply.result.executionContextId
    page.worlds.set(frameId, contextId)
    return contextId
  }

  /** Evaluate an expression in the driver's isolated world of the main frame; retried once after a navigation. */
  async evaluate(page, expression, { returnByValue = true, awaitPromise = true, timeoutMs = 10_000 } = {}) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const contextId = await this.isolatedContext(page)
      try {
        const reply = await this.send(page, 'Runtime.evaluate', { expression, contextId, returnByValue, awaitPromise }, { timeoutMs })
        const details = reply.result?.exceptionDetails
        if (details !== undefined) throw new Error(details.exception?.description ?? details.text ?? 'the page script failed')
        return reply.result.result
      } catch (error) {
        if (attempt === 1 || !/context|Cannot find/i.test(String(error.message))) throw error
        page.worlds.clear()
      }
    }
    return undefined
  }

  /** Resolve when a dialog opens on the page (renewed after each dialog closes). */
  dialogOpened(page) {
    return page.dialogPromise
  }

  close() {
    if (this.closed) return
    this.closed = true
    try {
      this.connection.close()
    } catch {
      // The connection may already be gone; closing is still the intent.
    }
  }

  async #attached({ sessionId, targetInfo, waitingForDebugger }, parentSessionId) {
    if (targetInfo?.type === 'iframe') return this.#attachedFrame({ sessionId, targetInfo, waitingForDebugger }, parentSessionId)
    // Only the browser-level auto-attach yields tabs; anything else is resumed and left alone.
    if (targetInfo?.type !== 'page' || parentSessionId !== undefined) {
      if (waitingForDebugger) void this.connection.send('Runtime.runIfWaitingForDebugger', {}, { sessionId }).catch(() => {})
      return
    }
    if (this.pages.has(sessionId)) return
    const page = {
      sessionId,
      targetId: targetInfo.targetId,
      openerId: targetInfo.openerId,
      url: targetInfo.url || 'about:blank',
      title: targetInfo.title || '',
      mainFrameId: targetInfo.targetId,
      frames: new Set([targetInfo.targetId]),
      loaders: new Map(),
      worlds: new Map(),
      /** CU-153: the final request method of each main-frame document load, by loader id (a redirect re-sends it). */
      documentMethods: new Map(),
      /** CU-153: per history entry id, whether its document was the direct answer to a POST - set once, when it loads. */
      postEntries: new Map(),
      /** CU-153: the latest Page.getNavigationHistory, so state() can name what reload, back and forward would load. */
      history: null,
      /**
       * CU-155: the URL Chrome could not show when the main frame committed one of its own error or warning pages
       * (chrome-error://chromewebdata/: a certificate warning, a Safe Browsing warning, a network error), else null.
       * Kept apart from `url`, which Target.targetInfoChanged sets back to the attempted URL.
       */
      errorPage: null,
      webSockets: [],
      /** Cross-site (out-of-process) iframes by frame id: `{ sessionId, targetId, ready }`, see `#attachedFrame`. */
      frameSessions: new Map(),
      loading: false,
      loadEpoch: 0,
      dialog: null,
      crashed: false,
      ready: undefined,
    }
    this.#renewDialogPromise(page)
    this.pages.set(sessionId, page)
    const isPopup = typeof page.openerId === 'string' && page.openerId.length > 0
    if (this.foregroundId === undefined || isPopup) this.foregroundId = sessionId
    this.#listen(page)
    page.ready = this.#setUp(page, waitingForDebugger)
    await page.ready
    if (isPopup) {
      this.emit('popup', { tabId: page.targetId, url: page.url })
      this.emit('foreground', { tabId: page.targetId })
    }
  }

  /**
   * Set a page up before it runs. Measured: a popup paused by `waitForDebuggerOnStart` does not answer `Page.enable`
   * until it is resumed, so the calls are sent together, in order, with the resume last, and awaited as a group (the
   * device metrics are applied by the browser side before the page's first script either way).
   *
   * The page's own auto-attach asks for its cross-site iframes only (`filter`), so workers and prerendered pages stay
   * unattached as before. A refusal of it is not worth failing the page: `inspectPoint` then stops at the iframe.
   */
  async #setUp(page, waitingForDebugger) {
    const send = (method, params) => this.send(page, method, params, { timeoutMs: 10_000 })
    const calls = [
      send('Page.enable'),
      send('DOM.enable'),
      send('Network.enable', { maxTotalBufferSize: 0, maxResourceBufferSize: 0 }),
      send('Emulation.setDeviceMetricsOverride', { width: this.viewport.width, height: this.viewport.height, deviceScaleFactor: 1, mobile: false }),
      send('Page.setInterceptFileChooserDialog', { enabled: true }),
      send('Page.getFrameTree'),
      send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: [{ type: 'iframe' }] }).catch(() => null),
      ...(waitingForDebugger ? [send('Runtime.runIfWaitingForDebugger')] : []),
    ]
    const results = await Promise.all(calls)
    const tree = results[5]
    const walk = (node) => {
      if (node?.frame === undefined) return
      page.frames.add(node.frame.id)
      if (!page.loaders.has(node.frame.id)) page.loaders.set(node.frame.id, node.frame.loaderId)
      for (const child of node.childFrames ?? []) walk(child)
    }
    if (page.loadEpoch === 0) page.mainFrameId = tree.result.frameTree.frame.id
    walk(tree.result.frameTree)
  }

  /**
   * A cross-site iframe: an out-of-process frame, attached through its page's own auto-attach and announced on that
   * page's session. It is never a page: no foreground change, no popup, no tab. It is kept on its page under its frame
   * id (an OOPIF's frame id is its target id) so `inspectPoint` can hit-test inside it through this session.
   *
   * `DOM.enable` and the resume are sent together, in order, the resume last, and awaited as a group, as `#setUp`
   * does for a paused popup; every path resumes a paused target, so a frame never stays stalled. A frame whose set-up
   * fails is dropped again (`ready` resolves false, never rejects): a point in it resolves to the iframe element, as
   * before. A frame session sets no auto-attach of its own, so a cross-site frame inside it is not attached: one
   * level deep. The site filter needs nothing here: the browser-level `Fetch` already pauses this frame's requests.
   */
  async #attachedFrame({ sessionId, targetInfo, waitingForDebugger }, parentSessionId) {
    const send = (method) => this.connection.send(method, {}, { sessionId, timeoutMs: 10_000 })
    const page = parentSessionId === undefined ? undefined : this.pages.get(parentSessionId)
    if (page === undefined || typeof targetInfo.targetId !== 'string') {
      if (waitingForDebugger) await send('Runtime.runIfWaitingForDebugger').catch(() => {})
      return
    }
    const frame = { sessionId, targetId: targetInfo.targetId, ready: undefined }
    const calls = [send('DOM.enable')]
    if (waitingForDebugger) calls.push(send('Runtime.runIfWaitingForDebugger'))
    frame.ready = Promise.all(calls).then(() => true, () => {
      if (page.frameSessions.get(frame.targetId) === frame) page.frameSessions.delete(frame.targetId)
      return false
    })
    page.frameSessions.set(frame.targetId, frame)
    await frame.ready
  }

  /**
   * CU-153: after a main-frame navigation the history is read, and used only once it is fresh - its current entry is
   * this page's URL - because right at Page.frameNavigated Chrome can still report the previous entry as current (a
   * real-browser probe caught the stale read: the POST answer went unmarked and a reload re-posted). It is retried
   * briefly until fresh. On a fresh read after a load, the current entry is marked once from that document's final
   * request method and keeps the mark: a later restore (back-forward cache, or a re-POST) must not wash it out. A
   * same-document move (pushState) refreshes the history without marking. A history never fresh stays unused.
   */
  async #recordHistory(page, mark) {
    for (let attempt = 0; attempt < 20; attempt++) {
      let history
      try {
        history = (await this.send(page, 'Page.getNavigationHistory', {}, { timeoutMs: 5000 })).result
      } catch {
        return
      }
      const entry = history?.entries?.[history.currentIndex]
      if (entry !== undefined && sameDocument(entry.url, page.url)) {
        page.history = history
        const loader = page.loaders.get(page.mainFrameId)
        if (mark && page.documentMethods.has(loader) && !page.postEntries.has(entry.id)) {
          page.postEntries.set(entry.id, page.documentMethods.get(loader) === 'POST')
        }
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  /**
   * CU-153: what reload, back and forward would load on a page - `{ current, back, forward }`, each
   * `{ postResult }` or null. The current entry is known at once from the document itself (its loader's final request
   * method, set when the navigation commits), so a reload right after a POST is judged without waiting for the
   * history; its sticky mark, once read fresh, wins (a restored POST answer). Back and forward come from a fresh history
   * only: null when the history is not yet fresh or an entry was never seen loading - judged as before.
   */
  historyMoves(page) {
    const history = page.history
    const fresh = history !== null && sameDocument(history.entries?.[history.currentIndex]?.url, page.url)
    const mark = (index) => {
      const entry = fresh ? history.entries?.[index] : undefined
      return entry !== undefined && page.postEntries.has(entry.id) ? { postResult: page.postEntries.get(entry.id) } : null
    }
    const loader = page.loaders.get(page.mainFrameId)
    const own = page.documentMethods.has(loader) ? { postResult: page.documentMethods.get(loader) === 'POST' } : null
    return {
      current: (fresh ? mark(history.currentIndex) : null) ?? own,
      back: fresh ? mark(history.currentIndex - 1) : null,
      forward: fresh ? mark(history.currentIndex + 1) : null,
    }
  }

  #listen(page) {
    const on = (method, handler) => this.connection.on(method, (params, message) => {
      if (message?.sessionId === page.sessionId) handler(params ?? {})
    })
    on('Page.frameAttached', ({ frameId }) => page.frames.add(frameId))
    // CU-360: a navigation to a scheme Chrome hands to another app (shortcuts:, zoommtg:, ...) never reaches Fetch and
    // needs no action of the run - a page script can start it. Chrome reports the request first (measured: reason
    // scriptInitiated, then 'Failed to launch ...' for a scheme with no handler); it becomes a notice, the scheme only.
    // Then a best-effort stop: Page.stopLoading at once (`stop`: sent, then sent_ok - Chrome took the command - or failed; `launched` stays 'unknown'). Chrome opens
    // mailto: (only mailto:) through the OS with no prompt (cu-researcher's reading of external_protocol_handler.cc)
    // after an asynchronous handler lookup, so the stop may or may not win that race; it is not measured against a real
    // launch (no app may be opened here), which is why the notice says what was tried, not that the launch was stopped.
    on('Page.frameRequestedNavigation', ({ url, reason }) => {
      let scheme
      try {
        scheme = new URL(String(url)).protocol
      } catch {
        return
      }
      if (['http:', 'https:', 'about:', 'data:', 'blob:', 'javascript:', 'chrome-error:'].includes(scheme)) return
      const notice = { kind: 'external_navigation_requested', url: scheme, reason: typeof reason === 'string' ? reason : null, at: Date.now(), stop: 'sent', launched: 'unknown' }
      this.notices.push(notice)
      this.emit('notice', notice)
      void this.send(page, 'Page.stopLoading').then(() => { notice.stop = 'sent_ok' }, () => { notice.stop = 'failed' })
    })
    on('Page.frameDetached', ({ frameId }) => {
      page.frames.delete(frameId)
      page.worlds.delete(frameId)
    })
    on('Page.frameNavigated', ({ frame }) => {
      if (frame === undefined) return
      page.frames.add(frame.id)
      page.loaders.set(frame.id, frame.loaderId)
      page.worlds.delete(frame.id)
      if (frame.parentId === undefined) {
        page.mainFrameId = frame.id
        page.url = frame.url + (frame.urlFragment ?? '')
        page.errorPage = typeof frame.url === 'string' && frame.url.startsWith('chrome-error:') ? (frame.unreachableUrl ?? frame.url) : null
        this.emit('navigation', { tabId: page.targetId, url: page.url })
        this.#recordHistory(page, true)
      }
    })
    on('Page.navigatedWithinDocument', ({ frameId, url }) => {
      if (frameId === page.mainFrameId) {
        page.url = url
        this.#recordHistory(page, false)
      }
    })
    // CU-153: a main-frame document's request method, last one per loader wins - a redirect re-sends the request with
    // the method it ends on (303: GET, 307: still POST), so a post-redirect-get page is not a POST answer.
    on('Network.requestWillBeSent', ({ loaderId, type, frameId, request }) => {
      if (type !== 'Document' || frameId !== page.mainFrameId || typeof loaderId !== 'string') return
      page.documentMethods.set(loaderId, String(request?.method ?? 'GET').toUpperCase())
      if (page.documentMethods.size > 64) page.documentMethods.delete(page.documentMethods.keys().next().value)
    })
    on('Page.frameStartedLoading', ({ frameId }) => {
      if (frameId !== page.mainFrameId) return
      page.loading = true
      page.loadEpoch += 1
    })
    on('Page.frameStoppedLoading', ({ frameId }) => {
      if (frameId !== page.mainFrameId) return
      page.loading = false
      // CU-153: by the end of a load the history has surely moved to its entry - a second chance to mark it, should
      // the read started at frameNavigated not have seen it fresh in time (a real-browser run showed that).
      this.#recordHistory(page, true)
    })
    on('Page.javascriptDialogOpening', (dialog) => {
      if (dialog.type === 'alert') {
        const notice = { kind: 'alert_accepted', message: dialog.message, url: dialog.url, at: Date.now() }
        this.notices.push(notice)
        this.emit('dialog', { ...notice, tabId: page.targetId })
        void this.send(page, 'Page.handleJavaScriptDialog', { accept: true }).catch(() => {})
        return
      }
      page.dialog = { type: dialog.type, message: dialog.message, defaultPrompt: dialog.defaultPrompt ?? '', url: dialog.url, promptText: undefined }
      this.emit('dialog', { kind: 'held', type: dialog.type, message: dialog.message, tabId: page.targetId })
      page.resolveDialog(page.dialog)
    })
    on('Page.javascriptDialogClosed', () => {
      const was = page.dialog
      page.dialog = null
      this.#renewDialogPromise(page)
      if (was !== null) this.emit('dialog', { kind: 'closed', type: was.type, tabId: page.targetId })
    })
    on('Page.fileChooserOpened', () => {
      const notice = { kind: 'file_chooser_refused', url: page.url, at: Date.now() }
      this.notices.push(notice)
      this.emit('notice', notice)
    })
    on('Network.webSocketCreated', ({ url }) => {
      page.webSockets.push({ url, at: Date.now() })
      if (page.webSockets.length > 50) page.webSockets.shift()
    })
    on('Inspector.targetCrashed', () => {
      page.crashed = true
      this.emit('crash', { tabId: page.targetId })
    })
  }

  #renewDialogPromise(page) {
    page.dialogPromise = new Promise((resolve) => {
      page.resolveDialog = resolve
    })
  }

  #detached({ sessionId }) {
    const page = this.pages.get(sessionId)
    if (page === undefined) {
      // A frame session ends when its iframe goes away or navigates back to its page's site; the page stays.
      for (const candidate of this.pages.values()) {
        for (const [frameId, frame] of candidate.frameSessions) if (frame.sessionId === sessionId) candidate.frameSessions.delete(frameId)
      }
      return
    }
    this.pages.delete(sessionId)
    if (this.foregroundId !== sessionId) return
    const opener = [...this.pages.values()].find((candidate) => candidate.targetId === page.openerId)
    const remaining = [...this.pages.keys()]
    this.foregroundId = opener?.sessionId ?? remaining.at(-1)
    const next = this.foreground(false)
    if (next !== undefined) this.emit('foreground', { tabId: next.targetId })
  }
}

/** One protocol failure as an EnvironmentError (already-wrapped errors pass through). */
export function protocolError(error, method, page = null, closed = false) {
  if (error instanceof EnvironmentError) return error
  const message = String(error?.message ?? error)
  const details = { method, cdpCode: typeof error?.code === 'number' ? error.code : null, cdpMessage: message }
  if (/did not answer|timed out/i.test(message)) return new EnvironmentError('timeout', `the browser did not answer ${method} in time`, details)
  if (page?.crashed) return new EnvironmentError('browser_crashed', 'the page crashed', details)
  if (closed || /closed|not open|disconnected/i.test(message)) return new EnvironmentError('closed', 'the browser connection is closed', details)
  return new EnvironmentError('unsupported_action', `the browser refused ${method}: ${message}`, details)
}
