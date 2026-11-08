import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createRunClipboard } from '../../_environments_/chrome-browser/clipboard.mjs'
import { frameFor } from '../../_environments_/chrome-browser/coords.mjs'
import { EnvironmentError } from '../../_environments_/chrome-browser/errors.mjs'
import { executeAction } from '../../_environments_/chrome-browser/executor.mjs'
import { BrowserSession } from '../../_environments_/chrome-browser/session.mjs'
import { FakeConnection } from './fake-cdp.mjs'

const viewport = { width: 1280, height: 800 }
const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
const tick = () => new Promise((resolve) => setImmediate(resolve))

async function started(handlers) {
  const connection = new FakeConnection(handlers)
  const session = new BrowserSession(connection, {
    viewport,
    sitePolicy: (url) => (url.startsWith('http://127.0.0.1:43117') ? 'allow' : { block: 'not_allowed' }),
    isFixedDenied: () => false,
  })
  await session.start()
  return { connection, session }
}

function context(session, extra = {}) {
  return { session, frame: frameFor(viewport, 1), clipboard: createRunClipboard(), navigationTimeoutMs: 200, screenshot: async () => ({ zoom: true }), ...extra }
}

test('start: downloads denied, browser-level Fetch, auto-attach that pauses new pages; the first page is the foreground', async () => {
  const { connection, session } = await started()
  assert.deepEqual(connection.of('Browser.setDownloadBehavior')[0].params, { behavior: 'deny', eventsEnabled: true })
  assert.equal(connection.of('Fetch.enable')[0].sessionId, undefined)
  assert.equal(connection.of('Target.setAutoAttach')[0].params.waitForDebuggerOnStart, true)
  assert.equal(session.foreground().sessionId, 'S1')
  assert.deepEqual(connection.of('Emulation.setDeviceMetricsOverride', 'S1')[0].params, { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  assert.equal(connection.of('Page.setInterceptFileChooserDialog', 'S1').length, 1)
  assert.equal(connection.of('Runtime.runIfWaitingForDebugger', 'S1').length, 0, 'an existing page is not paused')
})

test('a paused popup is set up and resumed in one group, becomes the foreground, and closing it returns to the opener', async () => {
  let resumed = false
  const { connection, session } = await started({
    // A paused popup answers Page.enable only after it is resumed (measured).
    'Page.enable': (params, sessionId) => (sessionId === 'S2' && !resumed ? new Promise((resolve) => { connection.release = resolve }) : { result: {} }),
    'Runtime.runIfWaitingForDebugger': () => {
      resumed = true
      connection.release?.({ result: {} })
      return { result: {} }
    },
  })
  const popups = []
  session.on('popup', (popup) => popups.push(popup))
  connection.emit('Target.attachedToTarget', { sessionId: 'S2', targetInfo: { type: 'page', targetId: 'T2', openerId: 'T1', url: 'about:blank' }, waitingForDebugger: true })
  await session.foreground().ready
  assert.equal(session.foreground().sessionId, 'S2')
  assert.equal(connection.of('Network.enable', 'S2').length, 1)
  assert.deepEqual(popups, [{ tabId: 'T2', url: 'about:blank' }])
  assert.equal(session.tabs().length, 2)
  connection.emit('Target.detachedFromTarget', { sessionId: 'S2' })
  assert.equal(session.foreground().sessionId, 'S1')
})

test('a cross-site iframe becomes a frame session of its page, set up and resumed in one group; never a page, foreground or popup; detaching removes it', async () => {
  let resumed = false
  const { connection, session } = await started({
    // As for a paused popup, a paused frame is taken to answer only once resumed: the group must not wait in between.
    'DOM.enable': (params, sessionId) => (sessionId === 'S1-F1' && !resumed ? new Promise((resolve) => { connection.release = resolve }) : { result: {} }),
    'Runtime.runIfWaitingForDebugger': () => {
      resumed = true
      connection.release?.({ result: {} })
      return { result: {} }
    },
  })
  assert.deepEqual(connection.of('Target.setAutoAttach', 'S1')[0].params, { autoAttach: true, waitForDebuggerOnStart: true, flatten: true, filter: [{ type: 'iframe' }] },
    "the page's own auto-attach asks for its cross-site iframes only")
  const events = []
  for (const name of ['popup', 'foreground']) session.on(name, () => events.push(name))
  const page = session.foreground()
  connection.emit('Target.attachedToTarget', { sessionId: 'S1-F1', targetInfo: { type: 'iframe', targetId: 'OOPIF-1', url: 'https://widget.example/' }, waitingForDebugger: true }, 'S1')
  const frame = page.frameSessions.get('OOPIF-1')
  assert.equal(await frame.ready, true)
  assert.equal(frame.sessionId, 'S1-F1')
  assert.deepEqual(connection.calls.filter((call) => call.sessionId === 'S1-F1').map((call) => call.method), ['DOM.enable', 'Runtime.runIfWaitingForDebugger'],
    'no page set-up (viewport, network, dialogs) on a frame, and the resume last')
  assert.equal(session.foreground().sessionId, 'S1')
  assert.deepEqual([session.pages.size, session.tabs().length], [1, 1])
  assert.deepEqual(events, [])
  connection.emit('Target.detachedFromTarget', { sessionId: 'S1-F1', targetId: 'OOPIF-1' }, 'S1')
  assert.equal(page.frameSessions.has('OOPIF-1'), false)
  assert.equal(session.foreground().sessionId, 'S1', 'the page stays')
  assert.deepEqual(events, [])
})

test('a frame of a frame, a frame from no known page, a frame failing set-up, or a page reached through a page are only resumed', async () => {
  const { connection, session } = await started({
    'DOM.enable': (params, sessionId) => {
      if (sessionId === 'S1-F2') throw new Error('No session with given id')
      return { result: {} }
    },
  })
  const page = session.foreground()
  const attach = (sessionId, type, targetId, parent) => connection.emit('Target.attachedToTarget', { sessionId, targetInfo: { type, targetId }, waitingForDebugger: true }, parent)
  attach('S1-F1', 'iframe', 'OOPIF-1', 'S1')
  await page.frameSessions.get('OOPIF-1').ready
  attach('S1-F1-F1', 'iframe', 'OOPIF-11', 'S1-F1') // one level deep: never asked for, resumed if it comes anyway
  attach('S7', 'iframe', 'OOPIF-7', 'S-unknown')
  attach('S1-F2', 'iframe', 'OOPIF-2', 'S1')
  attach('S8', 'page', 'T8', 'S1') // a page's own target (a prerender, say) is not a tab
  const failing = page.frameSessions.get('OOPIF-2')
  assert.equal(await failing.ready, false)
  await tick()
  for (const id of ['S1-F1-F1', 'S7', 'S1-F2', 'S8']) assert.equal(connection.of('Runtime.runIfWaitingForDebugger', id).length, 1, id)
  assert.deepEqual([...page.frameSessions.keys()], ['OOPIF-1'], 'a frame whose set-up failed is dropped again')
  assert.deepEqual([connection.of('DOM.enable', 'S1-F1-F1').length, connection.of('DOM.enable', 'S7').length], [0, 0])
  assert.deepEqual([session.pages.size, session.foreground().sessionId], [1, 'S1'])
  assert.deepEqual(session.notices, [], 'a frame is not a page whose set-up failed')
})

test('Fetch pauses from the browser session are decided; blocked ones are recorded once', async () => {
  const { connection, session } = await started()
  connection.emit('Fetch.requestPaused', { requestId: 'r1', request: { url: 'http://127.0.0.1:43117/' }, resourceType: 'Document', frameId: 'F-S1' })
  connection.emit('Fetch.requestPaused', { requestId: 'r2', request: { url: 'https://evil.example/' }, resourceType: 'Document', frameId: 'F-S1' })
  connection.emit('Fetch.requestPaused', { requestId: 'r3', request: { url: 'https://evil.example/x' } }, 'S1')
  await tick()
  assert.deepEqual(connection.of('Fetch.continueRequest').map((call) => call.params.requestId), ['r1'])
  assert.deepEqual(connection.of('Fetch.failRequest').map((call) => call.params.requestId), ['r2'])
  assert.deepEqual(session.blocked.map(({ url, rule }) => ({ url, rule })), [{ url: 'https://evil.example/', rule: 'not_allowed' }])
})

test('alert is accepted and recorded; confirm is held until closed', async () => {
  const { connection, session } = await started()
  connection.emit('Page.javascriptDialogOpening', { type: 'alert', message: 'hi', url: 'u' }, 'S1')
  assert.deepEqual(connection.of('Page.handleJavaScriptDialog', 'S1')[0].params, { accept: true })
  assert.equal(session.foreground().dialog, null)
  assert.equal(session.notices[0].kind, 'alert_accepted')
  connection.emit('Page.javascriptDialogOpening', { type: 'confirm', message: 'Delete?', url: 'u' }, 'S1')
  assert.equal(session.foreground().dialog.type, 'confirm')
  assert.equal(connection.of('Page.handleJavaScriptDialog', 'S1').length, 1, 'confirm is not answered by the driver')
  connection.emit('Page.javascriptDialogClosed', { result: false }, 'S1')
  assert.equal(session.foreground().dialog, null)
})

test('perform: control gate first, then the run signal', async () => {
  const { session } = await started()
  await assert.rejects(executeAction({ type: 'wait', duration_ms: 1 }, context(session, { control: { agentMayAct: () => false } })), code('taken_over'))
  const abort = new AbortController()
  abort.abort()
  await assert.rejects(executeAction({ type: 'wait', duration_ms: 1 }, context(session, { signal: abort.signal })), code('cancelled'))
  const later = new AbortController()
  setTimeout(() => later.abort(), 20)
  const started_ = Date.now()
  await assert.rejects(executeAction({ type: 'wait', duration_ms: 5000 }, context(session, { signal: later.signal })), code('cancelled'))
  assert.ok(Date.now() - started_ < 1000)
})

test('perform: a click sends its planned events to the foreground page and reports an effect', async () => {
  const { connection, session } = await started()
  const effect = await executeAction({ type: 'click', x: 10, y: 20, button: 'left' }, context(session))
  assert.deepEqual(connection.of('Input.dispatchMouseEvent', 'S1').map((call) => call.params.type), ['mouseMoved', 'mousePressed', 'mouseReleased'])
  assert.deepEqual(effect, { navigated: false, url: 'about:blank', blocked: [], popup: null, dialog: null })
})

test('perform: a click that opens confirm stops there and reports it; then only ENTER, ESCAPE or a prompt answer pass', async () => {
  const { connection, session } = await started({
    'Input.dispatchMouseEvent': (params) => {
      if (params.type !== 'mouseReleased') return { result: {} }
      setImmediate(() => connection.emit('Page.javascriptDialogOpening', { type: 'confirm', message: 'Delete?', url: 'u' }, 'S1'))
      return new Promise(() => {}) // the renderer is blocked on the dialog: this call never answers
    },
  })
  const effect = await executeAction({ type: 'click', x: 10, y: 20, button: 'left', keys: ['SHIFT'] }, context(session))
  assert.deepEqual(effect.dialog, { type: 'confirm', message: 'Delete?' })
  await assert.rejects(executeAction({ type: 'click', x: 1, y: 1, button: 'left' }, context(session)), code('dialog_open'))
  await assert.rejects(executeAction({ type: 'type', text: 'yes' }, context(session)), code('dialog_open'), 'type only fills a prompt')
  assert.equal((await executeAction({ type: 'wait', duration_ms: 1 }, context(session))).dialog.type, 'confirm', 'wait is allowed')
  const answered = await executeAction({ type: 'keypress', keys: ['ESC'] }, context(session))
  assert.equal(answered.dialogAnswered.answered, 'dismissed')
  connection.emit('Page.javascriptDialogClosed', { result: false }, 'S1')
  assert.deepEqual(connection.of('Page.handleJavaScriptDialog', 'S1').at(-1).params, { accept: false })
})

test('perform: a prompt is filled by type and accepted by ENTER with that text', async () => {
  const { connection, session } = await started()
  connection.emit('Page.javascriptDialogOpening', { type: 'prompt', message: 'Name?', defaultPrompt: 'x', url: 'u' }, 'S1')
  const typed = await executeAction({ type: 'type', text: 'Ada' }, context(session))
  assert.equal(typed.promptTextLength, 3)
  assert.equal(typed.dialog.type, 'prompt', 'still held until answered')
  await executeAction({ type: 'keypress', keys: ['RETURN'] }, context(session))
  assert.deepEqual(connection.of('Page.handleJavaScriptDialog', 'S1').at(-1).params, { accept: true, promptText: 'Ada' })
})

test('perform: requests blocked during an action are reported in its effect only', async () => {
  const { connection, session } = await started({
    'Page.navigate': () => {
      connection.emit('Fetch.requestPaused', { requestId: 'n1', request: { url: 'https://evil.example/' }, resourceType: 'Document', frameId: 'F-S1' })
      return { result: { errorText: 'net::ERR_ABORTED' } }
    },
  })
  const effect = await executeAction({ type: 'navigate', url: 'https://evil.example/' }, context(session))
  assert.deepEqual(effect.blocked, [{ url: 'https://evil.example/', rule: 'not_allowed' }])
  assert.equal(effect.navigationError, 'net::ERR_ABORTED')
  const next = await executeAction({ type: 'wait', duration_ms: 1 }, context(session))
  assert.deepEqual(next.blocked, [])
})

test('perform: a started navigation is awaited until the main frame stops loading, bounded', async () => {
  const { connection, session } = await started({
    'Input.dispatchMouseEvent': (params) => {
      if (params.type === 'mouseReleased') {
        connection.emit('Page.frameStartedLoading', { frameId: 'F-S1' }, 'S1')
        setTimeout(() => {
          connection.emit('Page.frameNavigated', { frame: { id: 'F-S1', loaderId: 'L2', url: 'http://127.0.0.1:43117/next' } }, 'S1')
          connection.emit('Page.frameStoppedLoading', { frameId: 'F-S1' }, 'S1')
        }, 100)
      }
      return { result: {} }
    },
  })
  const effect = await executeAction({ type: 'click', x: 5, y: 5, button: 'left' }, context(session, { navigationTimeoutMs: 1000 }))
  assert.equal(effect.navigated, true)
  assert.equal(effect.url, 'http://127.0.0.1:43117/next')
})

test('perform: copy reads the selection into the run clipboard and paste inserts it; history needs an entry', async () => {
  const { connection, session } = await started({
    'Runtime.evaluate': () => ({ result: { result: { value: { text: 'Order 123', editable: false } } } }),
    'Page.getNavigationHistory': () => ({ result: { currentIndex: 0, entries: [{ id: 1, url: 'a' }] } }),
  })
  const ctx = context(session)
  assert.deepEqual((await executeAction({ type: 'keypress', keys: ['CTRL', 'C'] }, ctx)).clipboard, { op: 'copy', length: 9 })
  assert.deepEqual((await executeAction({ type: 'keypress', keys: ['META', 'V'] }, ctx)).clipboard, { op: 'paste', length: 9 })
  assert.deepEqual(connection.of('Input.insertText', 'S1').at(-1).params, { text: 'Order 123' })
  assert.equal(connection.of('Runtime.evaluate', 'S1').at(-1).params.contextId, 7, 'the selection is read in the isolated world')
  await assert.rejects(executeAction({ type: 'keypress', keys: ['ALT', 'LEFT'] }, ctx), code('invalid_argument'))
})

test("proxy refusals: a page's own WebSocket goes into blocked under its ws: URL, Chrome's background traffic into notices", async () => {
  const { connection, session } = await started()
  connection.emit('Network.webSocketCreated', { requestId: 'w1', url: 'ws://127.0.0.1:5555/feed' }, 'S1')
  session.recordBlocked({ url: 'http://127.0.0.1:5555/', rule: 'not_allowed', via: 'proxy' })
  session.recordBlocked({ url: 'https://update.googleapis.com/', rule: 'not_allowed', via: 'proxy' })
  session.recordBlocked({ url: 'https://evil.example/', rule: 'not_allowed' })
  assert.deepEqual(session.blocked.map(({ url, via }) => [url, via]), [['ws://127.0.0.1:5555/feed', 'proxy'], ['https://evil.example/', undefined]])
  assert.deepEqual(session.notices.filter((n) => n.kind === 'browser_traffic_blocked').map((n) => n.url), ['https://update.googleapis.com/'])
  const old = Date.now() - 20_000
  session.recordBlocked({ url: 'http://127.0.0.1:5555/', rule: 'not_allowed', via: 'proxy', at: old + 40_000 })
  assert.equal(session.blocked.length, 2, 'a WebSocket older than 15 s no longer claims a refusal')
  connection.emit('Network.webSocketCreated', { requestId: 'w2', url: 'wss://chat.example/socket' }, 'S1')
  session.recordBlocked({ url: 'https://chat.example/', rule: 'not_allowed', via: 'proxy' })
  assert.equal(session.blocked.at(-1).url, 'wss://chat.example/socket', 'wss: matches its tunnel on port 443')
  assert.ok(connection.of('Network.enable', 'S1').length === 1)
})

test('a wheel waits for two page frames before and after it, in the isolated world', async () => {
  const { connection, session } = await started()
  await executeAction({ type: 'scroll', x: 10, y: 10, scroll_x: 0, scroll_y: 120 }, context(session))
  const order = connection.calls.filter((call) => call.sessionId === 'S1' && (call.method === 'Runtime.evaluate' || (call.method === 'Input.dispatchMouseEvent' && call.params.type === 'mouseWheel')))
    .map((call) => (call.method === 'Runtime.evaluate' ? (call.params.expression.includes('requestAnimationFrame') ? 'frames' : 'other') : 'wheel'))
  assert.deepEqual(order, ['frames', 'wheel', 'frames'])
})

test('a DNS-rebinding refusal from the proxy is the page\'s and goes into blocked', async () => {
  const { session } = await started()
  session.recordBlocked({ url: 'http://rebind.example/', rule: 'dns_private_address', via: 'proxy' })
  assert.deepEqual(session.blocked.map(({ url, rule }) => [url, rule]), [['http://rebind.example/', 'dns_private_address']])
})

// CU-153: a page whose history entries carry URLs, as Chrome's do; staleFor makes the next reads report the previous
// entry as current, as a real browser can right at Page.frameNavigated.
async function historyPage() {
  const state = { history: { currentIndex: 0, entries: [] }, stale: 0, previous: null }
  const { connection, session } = await started({
    'Page.getNavigationHistory': () => {
      if (state.stale > 0 && state.previous !== null) {
        state.stale -= 1
        return { result: state.previous }
      }
      return { result: state.history }
    },
  })
  const page = session.foreground()
  const main = page.mainFrameId
  const at = (id) => `http://127.0.0.1:43117/p${id}`
  const settle = async () => {
    for (let i = 0; i < 80 && !(page.history?.entries?.[page.history.currentIndex]?.url === page.url); i++) await new Promise((resolve) => setTimeout(resolve, 5))
  }
  const load = async (loaderId, methods, count, currentIndex, { staleFor = 0, wait = true } = {}) => {
    methods.forEach((method, i) => connection.emit('Network.requestWillBeSent', {
      requestId: `r-${loaderId}`, loaderId, type: 'Document', frameId: main, request: { method },
      ...(i > 0 ? { redirectResponse: { status: method === 'GET' ? 303 : 307 } } : {}),
    }, 'S1'))
    state.previous = state.history
    state.history = { currentIndex, entries: Array.from({ length: count }, (_, k) => ({ id: k + 1, url: at(k + 1) })) }
    state.stale = staleFor
    connection.emit('Page.frameNavigated', { frame: { id: main, loaderId, url: at(currentIndex + 1) } }, 'S1')
    if (wait) await settle()
  }
  return { connection, session, page, main, load, settle }
}

test('CU-153: each history entry is marked once by its document request - a POST answer true, post-redirect-get false, a 307 still true; marks are sticky; a frame does not count', async () => {
  const { connection, session, page, main, load } = await historyPage()
  assert.deepEqual(session.historyMoves(page), { current: null, back: null, forward: null }, 'nothing seen loading yet')
  await load('L1', ['GET'], 1, 0)
  await load('L2', ['POST'], 2, 1)
  assert.deepEqual(session.historyMoves(page), { current: { postResult: true }, back: { postResult: false }, forward: null })
  await load('L3', ['POST', 'GET'], 3, 2)
  assert.deepEqual(session.historyMoves(page).current, { postResult: false }, 'post-redirect-get (303) ends on a GET')
  await load('L4', ['POST', 'POST'], 4, 3)
  assert.deepEqual(session.historyMoves(page).current, { postResult: true }, 'a 307 keeps the POST')
  await load('L5', ['GET'], 4, 1)
  assert.deepEqual(session.historyMoves(page), { current: { postResult: true }, back: { postResult: false }, forward: { postResult: false } }, 'back to the POST answer, restored by a GET: its mark stays')
  connection.emit('Network.requestWillBeSent', { requestId: 'rf', loaderId: 'LF', type: 'Document', frameId: 'child-frame', request: { method: 'POST' } }, 'S1')
  await load('LF', [], 5, 4)
  assert.equal(session.historyMoves(page).current, null, 'a child frame\'s POST is not the page\'s document: unknown, not true')
  void main
})

test('CU-153: a stale history at frameNavigated (the real-browser race) - the POST answer is known at once from its own document, and marked once the history is fresh', async () => {
  const { session, page, load, settle } = await historyPage()
  await load('L1', ['GET'], 1, 0)
  await load('L2', ['POST'], 2, 1, { staleFor: 3, wait: false })
  assert.deepEqual(session.historyMoves(page).current, { postResult: true }, 'right after the commit, before any fresh history: a reload would re-post, so current says so')
  assert.equal(session.historyMoves(page).back, null, 'a stale history is not used: back is unknown, never the wrong entry')
  await settle()
  assert.deepEqual(session.historyMoves(page), { current: { postResult: true }, back: { postResult: false }, forward: null }, 'once fresh: the POST answer\'s own entry is marked, not the previous one')
  await load('L3', ['GET'], 3, 2)
  assert.deepEqual(session.historyMoves(page).back, { postResult: true }, 'and the mark is on the right entry: back onto the POST answer')
})

test('CU-153: a history stale beyond the retry window at frameNavigated - the end of the load marks the entry (a real-browser run showed the first read can miss it)', async () => {
  const { connection, session, page, main, load, settle } = await historyPage()
  await load('L1', ['GET'], 1, 0)
  await load('L2', ['POST'], 2, 1, { staleFor: 22, wait: false })
  await new Promise((resolve) => setTimeout(resolve, 1200))
  assert.equal(session.historyMoves(page).back, null, 'the first read gave up stale: back is unknown, not wrong')
  connection.emit('Page.frameStoppedLoading', { frameId: main }, 'S1')
  await settle()
  await load('L3', ['GET'], 3, 2)
  assert.deepEqual(session.historyMoves(page).back, { postResult: true }, 'the end of the load marked the POST answer\'s entry')
})

test('CU-155: a main frame committed as chrome-error:// is an error page, even after Target.targetInfoChanged sets the URL back to the attempted one; the next real page clears it', async () => {
  const { connection, session } = await started()
  const page = session.foreground()
  const main = page.mainFrameId
  connection.emit('Page.frameNavigated', { frame: { id: main, loaderId: 'E1', url: 'chrome-error://chromewebdata/', unreachableUrl: 'https://127.0.0.1:43118/' } }, 'S1')
  connection.emit('Target.targetInfoChanged', { targetInfo: { targetId: page.targetId, url: 'https://127.0.0.1:43118/', title: '127.0.0.1:43118' } })
  await tick()
  assert.equal(page.url, 'https://127.0.0.1:43118/', 'the URL is the attempted one, as a real browser reports it (the policy\'s chrome-error: check cannot see it)')
  assert.equal(page.errorPage, 'https://127.0.0.1:43118/', 'but the committed document was Chrome\'s own error page')
  connection.emit('Page.frameNavigated', { frame: { id: 'child', parentId: main, loaderId: 'C1', url: 'chrome-error://chromewebdata/' } }, 'S1')
  assert.equal(page.errorPage, 'https://127.0.0.1:43118/', 'a child frame\'s error does not change the page\'s')
  connection.emit('Page.frameNavigated', { frame: { id: main, loaderId: 'L2', url: 'http://127.0.0.1:43117/' } }, 'S1')
  assert.equal(page.errorPage, null, 'a real page clears it')
})
