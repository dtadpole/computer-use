import assert from 'node:assert/strict'
import { test } from 'node:test'

import net from 'node:net'

import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { createRunControl, ResourceRefusedError } from '../../_tools_/agent-core/lib.mjs'
import { launchBrowserEnvironment, noticeOf } from '../../_environments_/chrome-browser/environment.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { EnvironmentError } from '../../_environments_/chrome-browser/errors.mjs'
import { FakeConnection } from './fake-cdp.mjs'
import { CARD, IBAN_DE_COMPACT } from '../fixture-shapes/shapes.mjs'

const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected

/** Launch options wired to fakes, with counters for what was started, stopped and released. */
function harness({ handlers, gate, commandLine } = {}) {
  const counts = { started: 0, stopped: 0, released: 0, chromePid: null }
  const connection = new FakeConnection(handlers)
  const options = {
    seat: 'cu-test-seat',
    viewport: { width: 1280, height: 800 },
    frame: { maxWidth: 960 },
    sitePolicy: (url) => (url.startsWith('http://127.0.0.1:43117') ? 'allow' : { block: 'not_allowed' }),
    isFixedDenied: () => false,
    resourceGate: gate ?? (async () => ({ setChromePid: (pid) => { counts.chromePid = pid }, release: () => { counts.released += 1 } })),
    proxy: false,
    startChrome: async (args) => {
      counts.started += 1
      counts.proxyServer = args.proxyServer
      return { wsUrl: 'ws://fake', child: { pid: 4242 }, profile: '/tmp/cu-test-seat-chrome-abcdef', stderr: () => '', stop: async () => { counts.stopped += 1 } }
    },
    connect: async () => connection,
    ...(commandLine !== undefined ? { processCommandLine: async () => commandLine } : {}),
  }
  return { counts, connection, options }
}

test('the agent-core functions are required; nothing defaults to allow', async () => {
  const { counts, options } = harness()
  for (const name of ['sitePolicy', 'isFixedDenied', 'resourceGate']) {
    await assert.rejects(launchBrowserEnvironment({ ...options, [name]: undefined }), code('invalid_argument'), name)
  }
  await assert.rejects(launchBrowserEnvironment({ ...options, viewport: { width: 100, height: 800 } }), code('invalid_argument'))
  assert.equal(counts.started, 0)
})

test('a refusing resource gate stops the launch before Chrome starts, keeping the reason', async () => {
  const refusal = async () => { throw new ResourceRefusedError('team_cap', 'the team already runs 2 browsers (D-005, D-014)') }
  const { counts, options } = harness({ gate: refusal })
  await assert.rejects(launchBrowserEnvironment(options), (error) => error.code === 'resource_refused' && error.details.reason === 'team_cap')
  assert.equal(counts.started, 0)
  for (const gate of [async () => undefined, async () => false, async () => ({ ok: true })]) {
    const other = harness({ gate })
    await assert.rejects(launchBrowserEnvironment(other.options), code('resource_refused'), 'a slot without release is not trusted')
    assert.equal(other.counts.started, 0)
  }
  await assert.rejects(launchBrowserEnvironment({ ...options, seat: 'developer-two' }), code('invalid_argument'))
})

test('the slot learns the Chrome pid; isFixedDenied and the signal default to the run policy and control', async () => {
  const { counts, options } = harness()
  const policy = Object.assign((url) => (url.startsWith('http://127.0.0.1:43117') ? 'allow' : { block: 'not_allowed' }), { isFixedDenied: () => false })
  const control = createRunControl({ runId: 't' })
  const env = await launchBrowserEnvironment({ ...options, sitePolicy: policy, isFixedDenied: undefined, control })
  assert.equal(counts.chromePid, 4242)
  assert.equal(env.signal, control.signal)
  assert.deepEqual(control.send({ command: 'take_over' }, { source: 'control' }), { ok: true, state: 'taken_over' })
  await assert.rejects(env.perform({ type: 'wait', duration_ms: 1 }), code('taken_over'))
  control.send({ command: 'hand_back' }, { source: 'control' })
  await env.perform({ type: 'wait', duration_ms: 1 })
  control.send({ command: 'stop', reason: 'test' }, { source: 'control' })
  await assert.rejects(env.perform({ type: 'wait', duration_ms: 1 }), code('cancelled'))
  await env.close()
  assert.equal(counts.released, 1)
})

test('a Chrome without its sandbox is refused, stopped, and the gate released', async () => {
  const { counts, connection, options } = harness({ handlers: { 'Browser.getBrowserCommandLine': () => ({ result: { arguments: ['--headless=new', '--no-sandbox'] } }) } })
  await assert.rejects(launchBrowserEnvironment(options), code('sandbox_unavailable'))
  assert.deepEqual([counts.started, counts.stopped, counts.released], [1, 1, 1])
  assert.equal(connection.closed, true)
})

test('without Browser.getBrowserCommandLine the process table decides the sandbox check', async () => {
  const unavailable = { 'Browser.getBrowserCommandLine': () => { throw new Error('requires --enable-automation') } }
  const refused = harness({ handlers: unavailable, commandLine: ['--headless=new', '--no-sandbox'] })
  await assert.rejects(launchBrowserEnvironment(refused.options), code('sandbox_unavailable'))
  const fine = harness({ handlers: unavailable, commandLine: ['--headless=new', '--use-mock-keychain'] })
  const env = await launchBrowserEnvironment(fine.options)
  await env.close()
})

test('the frame comes from the image Chrome returned at the fitted scale', async () => {
  const { options } = harness()
  const env = await launchBrowserEnvironment(options)
  assert.deepEqual({ width: env.frame.width, height: env.frame.height, scale: env.frame.scale }, { width: 960, height: 600, scale: 0.75 })
  const shot = await env.screenshot()
  assert.deepEqual([shot.width, shot.height, shot.mimeType], [960, 600, 'image/png'])
  const zoom = await env.screenshot({ region: [0, 0, 120, 90] })
  assert.deepEqual([zoom.width, zoom.height], [160, 120])
  assert.equal(env.kind, 'browser')
  assert.equal(env.site, 'browser:chrome-local')
  await env.close()
})

test('a start URL refused by the site filter fails the launch and cleans up', async () => {
  const { counts, connection, options } = harness({
    handlers: {
      'Page.navigate': (params) => {
        connection.emit('Fetch.requestPaused', { requestId: 'n1', request: { url: params.url }, resourceType: 'Document', frameId: 'F-S1' })
        return { result: { errorText: 'net::ERR_ABORTED' } }
      },
    },
  })
  await assert.rejects(launchBrowserEnvironment({ ...options, startUrl: 'https://evil.example/' }), code('blocked_by_policy'))
  assert.deepEqual([counts.started, counts.stopped, counts.released], [1, 1, 1])
})

test('CU-360: a page\'s navigation to another app\'s scheme is a notice (the scheme only, the reason); web schemes are not', async () => {
  const { connection, options } = harness()
  const env = await launchBrowserEnvironment(options)
  const before = env.session.notices.length
  connection.emit('Page.frameRequestedNavigation', { frameId: 'F-S1', reason: 'scriptInitiated', url: 'shortcuts://run-shortcut?name=Wipe', disposition: 'currentTab' }, 'S1')
  connection.emit('Page.frameRequestedNavigation', { frameId: 'F-S1', reason: 'anchorClick', url: 'https://shop.example/next', disposition: 'currentTab' }, 'S1')
  connection.emit('Page.frameRequestedNavigation', { frameId: 'F-S9', reason: 'scriptInitiated', url: 'zoommtg://zoom.us/join', disposition: 'currentTab' }, 'S9')
  const added = env.session.notices.slice(before).map(({ kind, url, reason }) => [kind, url, reason])
  assert.deepEqual(added, [['external_navigation_requested', 'shortcuts:', 'scriptInitiated']], 'the app scheme of this page; not the web navigation, not another session\'s')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(connection.of('Page.stopLoading', 'S1').length, 1, 'the best-effort stop is sent once, on the page\'s session, for the app scheme only')
  assert.equal(connection.of('Page.stopLoading', 'S9').length, 0)
  assert.equal(env.session.notices.slice(before)[0].stop, 'sent_ok', 'Chrome took the stop command - what was tried')
  assert.equal(env.session.notices.slice(before)[0].launched, 'unknown', 'never that a launch was prevented: that race is not measured')
  await env.close()
})

test('CU-357: an effect reports the session notices since the last one - a refused download (no query), an accepted alert - once each; one between actions lands on the next', async () => {
  const { connection, options } = harness()
  const env = await launchBrowserEnvironment(options)
  env.session.notices.push({ kind: 'browser_traffic_blocked', url: 'https://update.example/check', rule: 'not_allowed', at: 1 })
  connection.emit('Browser.downloadWillBegin', { url: 'https://files.example/app.dmg?token=abc#x', guid: 'g1' })
  const first = await env.perform({ type: 'click', x: 10, y: 10, button: 'left' })
  assert.deepEqual(first.notices.map((n) => [n.kind, n.url]), [['download_refused', 'https://files.example/app.dmg']], 'the download, its token left out; Chrome\'s own background traffic is no effect of the action')
  assert.equal(typeof first.notices[0].at, 'number')
  const second = await env.perform({ type: 'click', x: 10, y: 10, button: 'left' })
  assert.equal(second.notices, undefined, 'reported once: no notices on the next effect')
  connection.emit('Page.javascriptDialogOpening', { type: 'alert', message: 'Saved.', url: 'https://shop.example/a?b=1' }, 'S1')
  const third = await env.perform({ type: 'click', x: 10, y: 10, button: 'left' })
  assert.deepEqual(third.notices.map((n) => [n.kind, n.messageLength, n.message, n.url]), [['alert_accepted', 6, undefined, 'https://shop.example/a']], 'an alert accepted between actions lands on the next effect - its length, never its text')
  await env.close()
})

test('CU-357: noticeOf keeps kind, time, rule and a driver message; an alert keeps only its length (page text may hold a secret); a URL loses its query and fragment; a non-web URL keeps its scheme only', () => {
  assert.deepEqual(noticeOf({ kind: 'browser_traffic_blocked', url: 'https://update.example/check?id=1', rule: 'not_allowed', at: 5, extra: 'x' }), { kind: 'browser_traffic_blocked', at: 5, url: 'https://update.example/check', rule: 'not_allowed' })
  assert.deepEqual(noticeOf({ kind: 'download_refused', url: 'data:application/octet-stream;base64,AAAA', at: 1 }), { kind: 'download_refused', at: 1, url: 'data:' })
  const key = ['sk', 'live', 'abcdefghijklmnop'].join('-')
  assert.deepEqual(noticeOf({ kind: 'alert_accepted', message: `Your new API key is ${key}`, at: 2 }), { kind: 'alert_accepted', at: 2, messageLength: 20 + key.length }, 'an alert carrying a key: its length only')
  assert.equal(noticeOf({ kind: 'page_setup_failed', message: 'm'.repeat(300), at: 2 }).message.length, 200)
  assert.deepEqual(noticeOf({ kind: 'page_setup_failed', message: 'boom', at: 3 }), { kind: 'page_setup_failed', at: 3, message: 'boom' })
  assert.deepEqual(noticeOf({ kind: 'external_navigation_requested', url: 'mailto:', reason: 'scriptInitiated', at: 4, stop: 'sent_ok', launched: 'unknown' }), { kind: 'external_navigation_requested', at: 4, url: 'mailto:', reason: 'scriptInitiated', stop: 'sent_ok', launched: 'unknown' }, 'CU-360: the external navigation keeps its reason, stop and launched in the effect')
})

test('while a dialog is held: the last screenshot comes back stale, page text is the dialog, targets are refused', async () => {
  const { connection, options } = harness()
  const env = await launchBrowserEnvironment(options)
  const before = await env.screenshot()
  connection.emit('Page.javascriptDialogOpening', { type: 'confirm', message: 'Send the payment?', url: 'u' }, 'S1')
  const shot = await env.screenshot()
  assert.equal(shot.stale, true)
  assert.deepEqual(shot.dialog, { type: 'confirm', message: 'Send the payment?' })
  assert.equal(shot.data, before.data)
  await assert.rejects(env.screenshot({ region: [0, 0, 10, 10] }), code('dialog_open'))
  assert.equal((await env.pageText()).text, 'Send the payment?')
  const target = await env.inspectPoint({ x: 10, y: 10 })
  assert.deepEqual([target.tag, target.role, target.name, target.dialogType, target.isPassword], ['dialog', 'alertdialog', 'Send the payment?', 'confirm', false])
  assert.equal((await env.focusedElement()).fingerprint, target.fingerprint, 'the dialog is the target of keys too')
  assert.deepEqual(env.state().dialog, { type: 'confirm', message: 'Send the payment?' })
  assert.deepEqual(await env.handleDialog({ accept: false }), { answered: 'dismissed' })
  await env.close()
})

test('inspectPoint refuses points outside the frame and describes the element at a point', async () => {
  const { options } = harness({
    handlers: {
      'DOM.getNodeForLocation': () => ({ result: { backendNodeId: 31, frameId: 'F-S1' } }),
      'DOM.describeNode': () => ({ result: { node: { nodeName: 'INPUT', attributes: ['type', 'password', 'autocomplete', 'current-password'] } } }),
      'Accessibility.getPartialAXTree': () => ({ result: { nodes: [{ backendDOMNodeId: 31, role: { value: 'textbox' }, name: { value: 'Password' } }] } }),
      'DOM.getBoxModel': () => ({ result: { model: { border: [20, 420, 320, 420, 320, 450, 20, 450] } } }),
      'DOM.resolveNode': () => ({ result: { object: { objectId: 'o1' } } }),
      'Runtime.callFunctionOn': () => ({ result: { result: { value: { origin: 'http://127.0.0.1:43117', editable: true, href: null } } } }),
    },
  })
  const env = await launchBrowserEnvironment(options)
  await assert.rejects(env.inspectPoint({ x: 960, y: 10 }), code('invalid_argument'))
  const target = await env.inspectPoint({ x: 127, y: 326 })
  assert.equal(target.isPassword, true)
  assert.equal(target.autocomplete, 'current-password')
  assert.equal(target.role, 'textbox')
  assert.equal(target.origin, 'http://127.0.0.1:43117')
  assert.deepEqual(target.box, { x: 15, y: 315, width: 225, height: 22.5 })
  assert.match(target.fingerprint, /^[0-9a-f]{32}$/)
  assert.equal((await env.inspectPoint({ x: 127, y: 326 })).fingerprint, target.fingerprint, 'stable for the same node')
  await env.close()
})

test('CU-194: an entry carries fieldKey - kept across a password toggle, new for another node or a new document, absent on non-entries; rule 5 keeps an entry caption only while unnamed', async () => {
  let node = { nodeName: 'INPUT', attributes: ['type', 'password'] }
  let axName = ''
  let extra = { origin: 'http://127.0.0.1:43117', editable: true, href: null, caption: null, entryCaption: 'Value · Password' }
  let hit = 31
  const { options, connection } = harness({
    handlers: {
      'DOM.getNodeForLocation': () => ({ result: { backendNodeId: hit, frameId: 'F-S1' } }),
      'DOM.describeNode': () => ({ result: { node } }),
      'Accessibility.getPartialAXTree': () => ({ result: { nodes: [{ backendDOMNodeId: hit, role: { value: 'textbox' }, name: { value: axName } }] } }),
      'DOM.getBoxModel': () => ({ result: { model: { border: [20, 420, 320, 420, 320, 450, 20, 450] } } }),
      'DOM.resolveNode': () => ({ result: { object: { objectId: 'o1' } } }),
      'Runtime.callFunctionOn': () => ({ result: { result: { value: extra } } }),
    },
  })
  const env = await launchBrowserEnvironment(options)
  const at = { x: 127, y: 326 }
  const secret = await env.inspectPoint(at)
  assert.match(secret.fieldKey, /^[0-9a-f]{32}$/)
  assert.equal(secret.caption, 'Value · Password', 'an unnamed entry takes its structural caption')
  node = { nodeName: 'INPUT', attributes: ['type', 'text'] }
  const shown = await env.inspectPoint(at)
  assert.equal(shown.fieldKey, secret.fieldKey, 'the show-password toggle keeps the key')
  assert.notEqual(shown.fingerprint, secret.fingerprint, 'while the fingerprint follows the type')
  axName = 'Password'
  assert.equal((await env.inspectPoint(at)).caption, null, 'a named entry takes no caption')
  hit = 32
  assert.notEqual((await env.inspectPoint(at)).fieldKey, secret.fieldKey, 'another node, another key')
  hit = 31
  connection.emit('Page.frameNavigated', { frame: { id: 'F-S1', loaderId: 'L-next', url: 'http://127.0.0.1:43117/next' } }, 'S1')
  assert.notEqual((await env.inspectPoint(at)).fieldKey, secret.fieldKey, 'a new document, a new key: the memory ends with the page')
  extra = { ...extra, editable: false, caption: 'IBAN', entryCaption: null }
  const text = await env.inspectPoint(at)
  assert.equal(text.fieldKey, undefined, 'only entries carry a key')
  assert.equal(text.caption, 'IBAN', 'shown text keeps its caption')
  await env.close()
})

test('CU-194: a field in a same-origin frame keys alike as the click target (frame known) and as the paste destination (focusedElement, frame unknown)', async () => {
  const input = { nodeName: 'INPUT', attributes: ['type', 'password'], backendNodeId: 41 }
  const { options } = harness({
    handlers: {
      'DOM.getNodeForLocation': () => ({ result: { backendNodeId: 41, frameId: 'F-child' } }),
      'DOM.describeNode': () => ({ result: { node: input } }),
      'Runtime.evaluate': () => ({ result: { result: { type: 'object', objectId: 'focused-1' } } }),
      'Accessibility.getPartialAXTree': () => ({ result: { nodes: [{ backendDOMNodeId: 41, role: { value: 'textbox' }, name: { value: '' } }] } }),
      'DOM.getBoxModel': () => ({ result: { model: { border: [20, 420, 320, 420, 320, 450, 20, 450] } } }),
      'DOM.resolveNode': () => ({ result: { object: { objectId: 'o1' } } }),
      'Runtime.callFunctionOn': () => ({ result: { result: { value: { origin: 'http://127.0.0.1:43117', editable: true, href: null, caption: null, entryCaption: null } } } }),
    },
  })
  const env = await launchBrowserEnvironment(options)
  const clicked = await env.inspectPoint({ x: 127, y: 326 })
  const focused = await env.focusedElement()
  assert.match(clicked.fieldKey, /^[0-9a-f]{32}$/)
  assert.equal(focused?.fieldKey, clicked.fieldKey, 'the remembered field is found again where the paste lands')
  await env.close()
})

test('close is idempotent and every member refuses afterwards', async () => {
  const { counts, options } = harness()
  const env = await launchBrowserEnvironment(options)
  await env.close()
  await env.close()
  assert.deepEqual([counts.started, counts.stopped, counts.released], [1, 1, 1])
  await assert.rejects(env.perform({ type: 'wait' }), code('closed'))
  await assert.rejects(env.screenshot(), code('closed'))
  assert.throws(() => env.state(), code('closed'))
})

test('the proxy starts before Chrome, is handed to it, and closes with the environment', async () => {
  const { counts, options } = harness()
  const env = await launchBrowserEnvironment({ ...options, proxy: undefined })
  assert.match(counts.proxyServer, /^127\.0\.0\.1:\d+$/)
  const port = Number(counts.proxyServer.split(':')[1])
  await env.close()
  const refused = await new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1')
    socket.on('error', () => resolve(true))
    socket.on('connect', () => { socket.destroy(); resolve(false) })
  })
  assert.equal(refused, true)
})

test("parity with agent-core's fake environment: same members, same synchronous state()", async () => {
  const { options } = harness()
  const env = await launchBrowserEnvironment(options)
  const fake = createFakeEnvironment()
  try {
    for (const [name, value] of Object.entries(fake)) {
      if (['emit', 'log', 'inputs', 'screenshotCount'].includes(name)) continue // the fake's own test hooks
      assert.equal(typeof env[name], typeof value, name)
    }
    for (const name of ['kind', 'site']) assert.equal(env[name] !== undefined, true, name)
    const state = env.state()
    assert.equal(typeof state.then, 'undefined', 'state() is synchronous')
    assert.deepEqual(Object.keys(state).sort(), ['dialog', 'history', 'interstitial', 'loading', 'tabs', 'title', 'url'], 'CU-153 adds history, CU-155 interstitial')
  } finally {
    await env.close()
    await fake.close?.()
  }
})

test('screencast: frames from the foreground are acknowledged and passed on, and the stream follows a popup', async () => {
  const { connection, options } = harness()
  const env = await launchBrowserEnvironment(options)
  const frames = []
  const stop = await env.startScreencast({ onFrame: (frame) => frames.push(frame), maxWidth: 640 })
  assert.deepEqual(connection.of('Page.startScreencast', 'S1')[0].params, { format: 'jpeg', quality: 60, maxWidth: 640, maxHeight: 400, everyNthFrame: 1 })
  connection.emit('Page.screencastFrame', { data: Buffer.from('jpeg-1').toString('base64'), sessionId: 11, metadata: { deviceWidth: 1280, deviceHeight: 800 } }, 'S1')
  connection.emit('Page.screencastFrame', { data: Buffer.from('elsewhere').toString('base64'), sessionId: 99, metadata: {} }, 'S9')
  assert.deepEqual(frames.map((frame) => [frame.data.toString(), frame.tabId, frame.mimeType]), [['jpeg-1', 'T1', 'image/jpeg']])
  assert.deepEqual(connection.of('Page.screencastFrameAck', 'S1').map((call) => call.params), [{ sessionId: 11 }])
  connection.emit('Target.attachedToTarget', { sessionId: 'S2', targetInfo: { type: 'page', targetId: 'T2', openerId: 'T1', url: 'about:blank' }, waitingForDebugger: false })
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(connection.of('Page.stopScreencast', 'S1').length, 1)
  assert.equal(connection.of('Page.startScreencast', 'S2').length, 1)
  await stop()
  assert.equal(connection.of('Page.stopScreencast', 'S2').length, 1)
  connection.emit('Page.screencastFrame', { data: Buffer.from('late').toString('base64'), sessionId: 12, metadata: {} }, 'S2')
  assert.equal(frames.length, 1, 'no frames after stop')
  await env.close()
})

test('human input is refused unless a person has taken over, then forwarded to the foreground page', async () => {
  const { connection, options } = harness()
  const control = createRunControl({ runId: 'h' })
  const env = await launchBrowserEnvironment({ ...options, control })
  await assert.rejects(env.humanInput({ type: 'mouse', action: 'down', x: 10, y: 10 }), code('unsupported_action'))
  control.send({ command: 'take_over' }, { source: 'control' })
  await env.humanInput({ type: 'mouse', action: 'down', x: 10, y: 10 })
  assert.deepEqual(connection.of('Input.dispatchMouseEvent', 'S1').at(-1).params.type, 'mousePressed')
  await assert.rejects(env.perform({ type: 'click', x: 1, y: 1, button: 'left' }), code('taken_over'), 'and the agent may not act meanwhile')
  control.send({ command: 'hand_back' }, { source: 'control' })
  await assert.rejects(env.humanInput({ type: 'text', text: 'x' }), code('unsupported_action'))
  await env.close()
})

test('CU-175/176: inspectPoint runs the real activatableAncestor and clickLabel as the page would - serialized, on a nested DOM', async () => {
  // The fake executes the function declarations the driver sends, so the walk itself (not a stub) decides the target.
  const view = { getComputedStyle: (n) => ({ cursor: n.cursor ?? 'auto' }) }
  const doc = { defaultView: view }
  const make = (tagName, { attrs = {}, cursor, text, parent } = {}) => ({ nodeType: 1, tagName, cursor, innerText: text, parentElement: parent ?? null,
    ownerDocument: doc, getAttribute: (name) => (name in attrs ? attrs[name] : null) })
  const body = make('BODY')
  const button = make('BUTTON', { text: 'Delete account', parent: body })
  const span = make('SPAN', { text: 'Delete account', parent: button })
  const card = make('DIV', { cursor: 'pointer', text: 'Remove item', parent: body })
  const label = make('SPAN', { cursor: 'pointer', text: 'Remove item', parent: card })
  const ids = new Map([[31, span], [77, button], [41, label], [88, card]])
  const idOf = (n) => [...ids].find(([, node]) => node === n)?.[0]
  const run = (declaration, self, args) => new Function(`return (${declaration})`)().apply(self, args)
  let hit = 31
  const { options } = harness({
    handlers: {
      'DOM.getNodeForLocation': () => ({ result: { backendNodeId: hit, frameId: 'F-S1' } }),
      'DOM.resolveNode': (params) => ({ result: { object: { objectId: `node-${params.backendNodeId}` } } }),
      'DOM.describeNode': (params) => {
        const id = params.backendNodeId ?? Number(String(params.objectId).replace('node-', ''))
        return { result: { node: { backendNodeId: id, nodeName: ids.get(id).tagName, attributes: [] } } }
      },
      'Accessibility.getPartialAXTree': (params) => ({ result: { nodes: [{ backendDOMNodeId: params.backendNodeId,
        role: { value: params.backendNodeId === 77 ? 'button' : 'generic' }, name: { value: params.backendNodeId === 77 ? 'Delete account' : '' } }] } }),
      'DOM.getBoxModel': () => ({ result: { model: { border: [20, 420, 320, 420, 320, 450, 20, 450] } } }),
      'Runtime.callFunctionOn': (params) => {
        const self = ids.get(Number(String(params.objectId).replace('node-', '')))
        if (params.functionDeclaration.includes('CONTROL_ROLES') && params.returnByValue === false) {
          return { result: { result: { objectId: `node-${idOf(run(params.functionDeclaration, self, []))}` } } }
        }
        if (params.functionDeclaration.includes('function (target)')) {
          const target = ids.get(Number(String(params.arguments[0].objectId).replace('node-', '')))
          return { result: { result: { value: run(params.functionDeclaration, self, [target]) } } }
        }
        return { result: { result: { value: { origin: 'http://127.0.0.1:43117', editable: false, href: null } } } }
      },
    },
  })
  const env = await launchBrowserEnvironment(options)
  const onButton = await env.inspectPoint({ x: 30, y: 326 })
  assert.deepEqual([onButton.tag, onButton.role, onButton.name], ['button', 'button', 'Delete account'], 'a label inside a button: the button')
  hit = 41
  const onCard = await env.inspectPoint({ x: 30, y: 326 })
  assert.deepEqual([onCard.tag, onCard.name], ['div', 'Remove item'], 'a label inside a pointer card: the card, named by its words')
  await env.close()
})

test("label click end to end: inspectPoint through the real walk resolves a <label>'s text to its control, and agent core judges that control - a CAPTCHA box hands off, a Delete button asks delete (cu-verifier's live under-ask, 9 Nov)", async () => {
  const view = { getComputedStyle: () => ({ cursor: 'auto' }) }
  const doc = { defaultView: view }
  const make = (tagName, { attrs = {}, text, parent, type, control } = {}) => ({ nodeType: 1, tagName, type, innerText: text, parentElement: parent ?? null,
    ownerDocument: doc, control, getAttribute: (name) => (name in attrs ? attrs[name] : null) })
  const body = make('BODY')
  const box = make('INPUT', { type: 'checkbox', parent: body })
  const boxLabel = make('LABEL', { text: 'Verify you are human', parent: body, control: box })
  const boxText = make('SPAN', { text: 'Verify you are human', parent: boxLabel })
  const button = make('BUTTON', { text: 'Delete account', parent: body })
  const buttonLabel = make('LABEL', { text: 'Delete my account now', parent: body, attrs: { for: 'del' }, control: button })
  const ids = new Map([[51, boxText], [52, boxLabel], [53, box], [61, buttonLabel], [62, button]])
  const idOf = (n) => [...ids].find(([, node]) => node === n)?.[0]
  const AX = { 53: ['checkbox', 'Verify you are human'], 62: ['button', 'Delete account'] }
  const run = (declaration, self, args) => new Function(`return (${declaration})`)().apply(self, args)
  let hit = 51
  const { options } = harness({
    handlers: {
      'DOM.getNodeForLocation': () => ({ result: { backendNodeId: hit, frameId: 'F-S1' } }),
      'DOM.resolveNode': (params) => ({ result: { object: { objectId: `node-${params.backendNodeId}` } } }),
      'DOM.describeNode': (params) => {
        const id = params.backendNodeId ?? Number(String(params.objectId).replace('node-', ''))
        return { result: { node: { backendNodeId: id, nodeName: ids.get(id).tagName, attributes: ids.get(id).type ? ['type', ids.get(id).type] : [] } } }
      },
      'Accessibility.getPartialAXTree': (params) => {
        const [role, name] = AX[params.backendNodeId] ?? ['LabelText', '']
        return { result: { nodes: [{ backendDOMNodeId: params.backendNodeId, role: { value: role }, name: { value: name } }] } }
      },
      'DOM.getBoxModel': () => ({ result: { model: { border: [20, 420, 320, 420, 320, 450, 20, 450] } } }),
      'Runtime.callFunctionOn': (params) => {
        const self = ids.get(Number(String(params.objectId).replace('node-', '')))
        if (params.functionDeclaration.includes('CONTROL_ROLES') && params.returnByValue === false) {
          return { result: { result: { objectId: `node-${idOf(run(params.functionDeclaration, self, []))}` } } }
        }
        if (params.functionDeclaration.includes('function (target)')) {
          const target = ids.get(Number(String(params.arguments[0].objectId).replace('node-', '')))
          return { result: { result: { value: run(params.functionDeclaration, self, [target]) } } }
        }
        return { result: { result: { value: { origin: 'http://127.0.0.1:43117', editable: false, href: null } } } }
      },
    },
  })
  const policy = createPolicy({ sitePolicy: () => 'allow' })
  const judge = (target) => {
    const verdict = policy.classify({ type: 'click', x: 30, y: 326, button: 'left' }, { url: 'http://127.0.0.1:43117/signup', target })
    return verdict.decision === 'allow' ? 'allow' : (verdict.class ?? verdict.decision)
  }
  const env = await launchBrowserEnvironment(options)
  const viaText = await env.inspectPoint({ x: 30, y: 326 })
  assert.deepEqual([viaText.tag, viaText.role, viaText.name], ['input', 'checkbox', 'Verify you are human'], "the label's text: its check box")
  assert.notEqual(judge(viaText), 'allow', 'the CAPTCHA box is not clicked unasked through its label')
  hit = 52
  assert.deepEqual([(await env.inspectPoint({ x: 30, y: 326 })).role], ['checkbox'], 'the label element itself: the same box')
  hit = 61
  const viaFor = await env.inspectPoint({ x: 30, y: 326 })
  assert.deepEqual([viaFor.tag, viaFor.role, viaFor.name], ['button', 'button', 'Delete account'], 'a label for= the button: the button')
  assert.equal(judge(viaFor), 'delete', 'the Delete button asks delete through its label')
  await env.close()
})

test('CU-175: inspectPoint judges a label or icon inside a button as the button it activates (role, name, box, fingerprint)', async () => {
  const SPAN = 31
  const BUTTON = 77
  const { options } = harness({
    handlers: {
      'DOM.getNodeForLocation': () => ({ result: { backendNodeId: SPAN, frameId: 'F-S1' } }),
      'DOM.describeNode': (params) => ({ result: { node: params.objectId === 'ancestor' || params.backendNodeId === BUTTON
        ? { backendNodeId: BUTTON, nodeName: 'BUTTON', attributes: [] } : { backendNodeId: SPAN, nodeName: 'SPAN', attributes: [] } } }),
      'Accessibility.getPartialAXTree': (params) => ({ result: { nodes: [params.backendNodeId === BUTTON
        ? { backendDOMNodeId: BUTTON, role: { value: 'button' }, name: { value: 'Delete account' } }
        : { backendDOMNodeId: SPAN, role: { value: 'generic' }, name: { value: '' } }] } }),
      'DOM.getBoxModel': (params) => ({ result: { model: { border: params.backendNodeId === BUTTON ? [20, 420, 320, 420, 320, 450, 20, 450] : [40, 425, 100, 425, 100, 445, 40, 445] } } }),
      'DOM.resolveNode': (params) => ({ result: { object: { objectId: `node-${params.backendNodeId}` } } }),
      'Runtime.callFunctionOn': (params) => (params.functionDeclaration.includes('CONTROL_ROLES') && params.returnByValue === false
        ? { result: { result: { objectId: params.objectId === `node-${SPAN}` ? 'ancestor' : params.objectId } } }
        : { result: { result: { value: { origin: 'http://127.0.0.1:43117', editable: false, href: null } } } }),
    },
  })
  const env = await launchBrowserEnvironment(options)
  const target = await env.inspectPoint({ x: 30, y: 326 })
  assert.equal(target.tag, 'button', 'the button, not the <span> under the pointer')
  assert.equal(target.role, 'button')
  assert.equal(target.name, 'Delete account')
  assert.deepEqual(target.box, { x: 15, y: 315, width: 225, height: 22.5 }, "the button's box")
  await env.close()
})

test('inspectPoint adds the scroll offset (getNodeForLocation takes document coordinates); no node is null; failures are EnvironmentErrors', async () => {
  const seen = []
  const { options } = harness({
    handlers: {
      'Page.getLayoutMetrics': () => ({ result: { cssVisualViewport: { pageX: 0, pageY: 2666 } } }),
      'DOM.getNodeForLocation': (params) => {
        seen.push([params.x, params.y])
        if (params.y < 2666) throw Object.assign(new Error('No node found at given location'), { code: -32000 })
        if (params.x > 900) throw Object.assign(new Error('Internal error'), { code: -32603 })
        return { result: { backendNodeId: 7, frameId: 'F-S1' } }
      },
      'DOM.describeNode': () => ({ result: { node: { nodeName: 'BUTTON', attributes: [] } } }),
      'Accessibility.getPartialAXTree': () => ({ result: { nodes: [{ backendDOMNodeId: 7, role: { value: 'button' }, name: { value: 'Add to wishlist' } }] } }),
      'DOM.getBoxModel': () => ({ result: { model: { border: [100, 300, 200, 300, 200, 340, 100, 340] } } }),
      'DOM.resolveNode': () => ({ result: { object: { objectId: 'o1' } } }),
      'Runtime.callFunctionOn': () => ({ result: { result: { value: { origin: 'http://127.0.0.1:43117', editable: false, href: null } } } }),
    },
  })
  const env = await launchBrowserEnvironment(options)
  const target = await env.inspectPoint({ x: 120, y: 240 })
  assert.deepEqual(seen.at(-1), [160, 320 + 2666], 'viewport point plus the scroll offset')
  assert.equal(target.name, 'Add to wishlist')
  env.session.connection.handlers['Page.getLayoutMetrics'] = () => ({ result: { cssVisualViewport: { pageX: 0, pageY: 0 } } })
  assert.equal(await env.inspectPoint({ x: 120, y: 240 }), null, 'no node at a point is empty space')
  env.session.connection.handlers['Page.getLayoutMetrics'] = () => ({ result: { cssVisualViewport: { pageX: 0, pageY: 3000 } } })
  await assert.rejects(env.inspectPoint({ x: 700, y: 240 }), (error) => error instanceof EnvironmentError && error.code === 'unsupported_action' && error.details.cdpCode === -32603)
  await env.close()
})

test('CU-175: a click target the accessibility tree leaves unnamed (a <div onclick>) takes the words it shows', async () => {
  const SPAN = 31
  const DIV = 88
  const { options } = harness({
    handlers: {
      'DOM.getNodeForLocation': () => ({ result: { backendNodeId: SPAN, frameId: 'F-S1' } }),
      'DOM.describeNode': (params) => ({ result: { node: params.objectId === 'ancestor' || params.backendNodeId === DIV
        ? { backendNodeId: DIV, nodeName: 'DIV', attributes: ['onclick', 'remove()'] } : { backendNodeId: SPAN, nodeName: 'SPAN', attributes: [] } } }),
      'Accessibility.getPartialAXTree': (params) => ({ result: { nodes: [{ backendDOMNodeId: params.backendNodeId, role: { value: 'generic' }, name: { value: '' } }] } }),
      'DOM.getBoxModel': () => ({ result: { model: { border: [20, 420, 320, 420, 320, 450, 20, 450] } } }),
      'DOM.resolveNode': (params) => ({ result: { object: { objectId: `node-${params.backendNodeId}` } } }),
      'Runtime.callFunctionOn': (params) => {
        if (params.functionDeclaration.includes('function (target)')) return { result: { result: { value: params.arguments?.[0]?.objectId === 'ancestor' ? 'Delete' : null } } }
        if (params.returnByValue === false) return { result: { result: { objectId: params.objectId === `node-${SPAN}` ? 'ancestor' : params.objectId } } }
        return { result: { result: { value: { origin: 'http://127.0.0.1:43117', editable: false, href: null } } } }
      },
    },
  })
  const env = await launchBrowserEnvironment(options)
  const target = await env.inspectPoint({ x: 30, y: 326 })
  assert.deepEqual([target.tag, target.role, target.name], ['div', 'generic', 'Delete'], 'the div, named by the words it shows')
  await env.close()
})

test('CU-175: inside a cross-site iframe too, a label inside a button is judged as the button - named by its words when the tree leaves it unnamed', async () => {
  const inFrame = (sessionId, inside, outside) => (sessionId === 'S1-F1' ? inside : outside)
  const SPAN = 6
  const BUTTON = 5
  const { connection, options } = harness({
    handlers: {
      'Page.getLayoutMetrics': () => ({ result: { cssVisualViewport: { pageX: 0, pageY: 0 } } }),
      'DOM.getNodeForLocation': (params, sessionId) => ({ result: inFrame(sessionId, { backendNodeId: SPAN, frameId: 'OOPIF-1' }, { backendNodeId: 40, frameId: 'F-S1' }) }),
      'DOM.describeNode': (params, sessionId) => ({
        result: { node: sessionId !== 'S1-F1' ? { nodeName: 'IFRAME', backendNodeId: 40, frameId: 'OOPIF-1', attributes: ['src', 'https://widget.example/pay'] }
          : params.objectId === 'ancestor' || params.backendNodeId === BUTTON ? { backendNodeId: BUTTON, nodeName: 'BUTTON', attributes: [] } : { backendNodeId: SPAN, nodeName: 'SPAN', attributes: [] } },
      }),
      'DOM.getBoxModel': (params, sessionId) => ({
        result: { model: inFrame(sessionId, { border: [20, 30, 120, 30, 120, 70, 20, 70] }, { content: [200, 100, 600, 100, 600, 400, 200, 400], border: [190, 90, 610, 90, 610, 410, 190, 410] }) },
      }),
      'Accessibility.getPartialAXTree': (params, sessionId) => ({
        result: { nodes: [sessionId !== 'S1-F1' ? { backendDOMNodeId: 40, role: { value: 'Iframe' }, name: { value: '' } }
          : params.backendNodeId === BUTTON ? { backendDOMNodeId: BUTTON, role: { value: 'button' }, name: { value: '' } } : { backendDOMNodeId: SPAN, role: { value: 'generic' }, name: { value: '' } }] },
      }),
      'DOM.resolveNode': (params) => ({ result: { object: { objectId: `node-${params.backendNodeId}` } } }),
      'Runtime.callFunctionOn': (params, sessionId) => {
        if (params.functionDeclaration.includes('function (target)')) return { result: { result: { value: params.arguments?.[0]?.objectId === 'ancestor' ? 'Pay now' : null } } }
        if (params.functionDeclaration.includes('CONTROL_ROLES') && params.returnByValue === false) return { result: { result: { objectId: params.objectId === `node-${SPAN}` ? 'ancestor' : params.objectId } } }
        return { result: { result: { value: { origin: inFrame(sessionId, 'https://widget.example', 'http://127.0.0.1:43117'), editable: false, href: null } } } }
      },
      'Page.getFrameTree': (params, sessionId) => ({ result: { frameTree: { frame: inFrame(sessionId, { id: 'OOPIF-1', loaderId: 'L-A' }, { id: `F-${sessionId}`, loaderId: `L-${sessionId}` }) } } }),
    },
  })
  const env = await launchBrowserEnvironment(options)
  connection.emit('Target.attachedToTarget', { sessionId: 'S1-F1', targetInfo: { type: 'iframe', targetId: 'OOPIF-1', url: 'https://widget.example/pay' }, waitingForDebugger: true }, 'S1')
  await env.session.foreground().frameSessions.get('OOPIF-1').ready
  const target = await env.inspectPoint({ x: 240, y: 120 })
  assert.deepEqual([target.tag, target.role, target.name, target.origin], ['button', 'button', 'Pay now', 'https://widget.example'], 'the button in the frame, not its label')
  await env.close()
})

test('inspectPoint describes the element inside a cross-site iframe through its frame session, one level deep', async () => {
  const at = { S1: [], 'S1-F1': [] }
  const child = { loader: 'L-A', empty: false }
  const inFrame = (sessionId, inside, outside) => (sessionId === 'S1-F1' ? inside : outside)
  const { connection, options } = harness({
    handlers: {
      // The page is scrolled by 500, the frame's own document by 50.
      'Page.getLayoutMetrics': (params, sessionId) => ({ result: { cssVisualViewport: { pageX: 0, pageY: inFrame(sessionId, 50, 500) } } }),
      'DOM.getNodeForLocation': (params, sessionId) => {
        at[sessionId]?.push([params.x, params.y])
        if (sessionId === 'S1-F1' && child.empty) throw Object.assign(new Error('No node found at given location'), { code: -32000 })
        return { result: inFrame(sessionId, { backendNodeId: 5, frameId: 'OOPIF-1' }, { backendNodeId: 40, frameId: 'F-S1' }) }
      },
      'DOM.describeNode': (params, sessionId) => ({
        result: { node: inFrame(sessionId, { nodeName: 'BUTTON', attributes: [] }, { nodeName: 'IFRAME', backendNodeId: 40, frameId: 'OOPIF-1', attributes: ['src', 'https://widget.example/pay'] }) },
      }),
      // The iframe's content box is at (200, 100) in the viewport; the button's box is in the frame's own viewport.
      'DOM.getBoxModel': (params, sessionId) => ({
        result: { model: inFrame(sessionId, { border: [20, 30, 120, 30, 120, 70, 20, 70] }, { content: [200, 100, 600, 100, 600, 400, 200, 400], border: [190, 90, 610, 90, 610, 410, 190, 410] }) },
      }),
      'Accessibility.getPartialAXTree': (params, sessionId) => ({
        result: { nodes: [inFrame(sessionId, { backendDOMNodeId: 5, role: { value: 'button' }, name: { value: 'Pay now' } }, { backendDOMNodeId: 40, role: { value: 'Iframe' }, name: { value: '' } })] },
      }),
      'DOM.resolveNode': () => ({ result: { object: { objectId: 'o1' } } }),
      'Runtime.callFunctionOn': (params, sessionId) => ({
        result: { result: { value: { origin: inFrame(sessionId, 'https://widget.example', 'http://127.0.0.1:43117'), editable: false, href: null } } },
      }),
      'Page.getFrameTree': (params, sessionId) => ({
        result: { frameTree: { frame: inFrame(sessionId, { id: 'OOPIF-1', loaderId: child.loader }, { id: `F-${sessionId}`, loaderId: `L-${sessionId}` }) } },
      }),
    },
  })
  const env = await launchBrowserEnvironment(options)
  // Frame (240, 120) is viewport (320, 160) at scale 0.75: inside the iframe's content box.
  assert.equal((await env.inspectPoint({ x: 240, y: 120 })).tag, 'iframe', 'without a frame session, the iframe element as before')
  connection.emit('Target.attachedToTarget', { sessionId: 'S1-F1', targetInfo: { type: 'iframe', targetId: 'OOPIF-1', url: 'https://widget.example/pay' }, waitingForDebugger: true }, 'S1')
  await env.session.foreground().frameSessions.get('OOPIF-1').ready
  assert.deepEqual([connection.of('DOM.enable', 'S1-F1').length, connection.of('Runtime.runIfWaitingForDebugger', 'S1-F1').length], [1, 1])
  assert.deepEqual([env.state().tabs.length, env.session.foreground().sessionId], [1, 'S1'], 'the frame is no tab and takes no foreground')
  const target = await env.inspectPoint({ x: 240, y: 120 })
  assert.deepEqual(at.S1.at(-1), [320, 160 + 500], 'the page hit-tests in its document coordinates')
  assert.deepEqual(at['S1-F1'].at(-1), [320 - 200, 160 - 100 + 50], 'the frame hit-tests in its own: minus the content origin, plus its scroll')
  assert.deepEqual([target.tag, target.role, target.name, target.origin, target.isPassword], ['button', 'button', 'Pay now', 'https://widget.example', false])
  assert.deepEqual(target.box, { x: 165, y: 97.5, width: 75, height: 30 }, 'the box moved back by the content origin, in frame pixels')
  assert.equal(connection.of('Page.createIsolatedWorld', 'S1-F1').at(-1).params.frameId, 'OOPIF-1', "read in the driver's world of the frame")
  assert.equal((await env.inspectPoint({ x: 240, y: 120 })).fingerprint, target.fingerprint, 'stable for the same node')
  child.loader = 'L-B'
  assert.notEqual((await env.inspectPoint({ x: 240, y: 120 })).fingerprint, target.fingerprint, 'the frame navigated: another target')
  // Frame (148, 120) is viewport (197.3, 160): the iframe's border, outside its content box.
  assert.deepEqual([(await env.inspectPoint({ x: 148, y: 120 })).tag, at['S1-F1'].length], ['iframe', 3], 'a point on the border is the iframe itself')
  child.empty = true
  assert.equal(await env.inspectPoint({ x: 240, y: 120 }), null, 'no node inside the frame is empty space')
  child.empty = false
  connection.emit('Target.detachedFromTarget', { sessionId: 'S1-F1', targetId: 'OOPIF-1' }, 'S1')
  assert.equal(env.session.foreground().frameSessions.size, 0)
  assert.equal((await env.inspectPoint({ x: 240, y: 120 })).tag, 'iframe', 'a frame session gone: the iframe element again')
  await env.close()
})

test('proxyLookup reaches the proxy: an allowed name resolving to loopback is refused before any connection', async () => {
  const { counts, options } = harness()
  const env = await launchBrowserEnvironment({ ...options, proxy: undefined, sitePolicy: () => 'allow', proxyLookup: async () => [{ address: '127.0.0.1' }] })
  const port = Number(counts.proxyServer.split(':')[1])
  const answer = await new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write('CONNECT rebind.test:443 HTTP/1.1\r\nhost: rebind.test:443\r\n\r\n'))
    let data = ''
    socket.on('data', (chunk) => { data += chunk })
    socket.on('close', () => resolve(data))
  })
  assert.match(answer, /^HTTP\/1\.1 403/)
  assert.ok(env.session.blocked.some((entry) => entry.rule === 'dns_private_address'))
  await env.close()
})

// CU-150: the focused field's form's implicit submit button, through the isolated world, as defaultButton.
function checkoutHandlers({ submit = true } = {}) {
  const nodes = { 31: { backendNodeId: 31, nodeName: 'INPUT', attributes: ['type', 'text'] }, 41: { backendNodeId: 41, nodeName: 'BUTTON', attributes: [] } }
  const ax = { 31: { role: 'textbox', name: 'Quantity' }, 41: { role: 'button', name: 'Place order' } }
  return {
    'Runtime.evaluate': ({ expression }) => (String(expression).includes('deepActiveElement') ? { result: { result: { objectId: 'active' } } } : { result: { result: { value: true } } }),
    'DOM.describeNode': ({ objectId, backendNodeId }) => ({ result: { node: objectId === 'active' ? nodes[31] : objectId === 'submit' ? nodes[41] : nodes[backendNodeId] } }),
    'Accessibility.getPartialAXTree': ({ backendNodeId }) => ({ result: { nodes: [{ backendDOMNodeId: backendNodeId, role: { value: ax[backendNodeId].role }, name: { value: ax[backendNodeId].name } }] } }),
    'DOM.resolveNode': ({ backendNodeId, executionContextId }) => ({ result: { object: { objectId: `world${executionContextId}-${backendNodeId}` } } }),
    'Runtime.callFunctionOn': ({ objectId, functionDeclaration }) => {
      if (String(functionDeclaration).includes('implicitSubmitButton')) {
        assert.match(objectId, /^world7-/, 'the lookup runs in the isolated world, never the page\'s own')
        return { result: { result: submit ? { objectId: 'submit' } : { type: 'object', subtype: 'null', value: null } } }
      }
      return { result: { result: { value: {} } } }
    },
  }
}

test('CU-150: focusedElement carries the form\'s implicit submit button as defaultButton (found in the isolated world), outside the fingerprint; null without one', async () => {
  const withSubmit = harness({ handlers: checkoutHandlers() })
  const env = await launchBrowserEnvironment(withSubmit.options)
  let target
  try {
    target = await env.focusedElement()
    assert.deepEqual([target.role, target.name], ['textbox', 'Quantity'], 'the target is still the focused field')
    assert.deepEqual(target.defaultButton, { role: 'button', name: 'Place order', panel: null })
  } finally {
    await env.close()
  }
  const without = harness({ handlers: checkoutHandlers({ submit: false }) })
  const bare = await launchBrowserEnvironment(without.options)
  try {
    const plain = await bare.focusedElement()
    assert.equal(plain.defaultButton, null, 'no submit button: the field\'s own name only')
    assert.equal(plain.fingerprint, target.fingerprint, 'the default button is context, not identity')
  } finally {
    await bare.close()
  }
})

test('CU-150 seam: the real browser driver\'s focusedElement into agent core\'s real policy - Enter in Quantity asks purchase by Place order; without the button it is allowed', async () => {
  const policy = createPolicy({ sitePolicy: () => 'allow' })
  const judge = (action, target) => policy.classify(action, { url: 'http://127.0.0.1:4000/checkout', target })
  const live = harness({ handlers: checkoutHandlers() })
  const env = await launchBrowserEnvironment(live.options)
  try {
    const target = await env.focusedElement()
    for (const action of [{ type: 'keypress', keys: ['ENTER'] }, { type: 'type', text: '2\n' }]) {
      const verdict = judge(action, target)
      assert.equal(verdict.decision, 'confirm', JSON.stringify(verdict))
      assert.ok([verdict.class, ...(verdict.classes ?? [])].includes('purchase'), JSON.stringify(verdict))
    }
    assert.equal(judge({ type: 'type', text: '2' }, target).decision, 'allow', 'no Return: no purchase')
  } finally {
    await env.close()
  }
  const plain = harness({ handlers: checkoutHandlers({ submit: false }) })
  const bare = await launchBrowserEnvironment(plain.options)
  try {
    assert.equal(judge({ type: 'keypress', keys: ['ENTER'] }, await bare.focusedElement()).decision, 'allow', 'no implicit submit button: judged by Quantity alone')
  } finally {
    await bare.close()
  }
})

test('CU-153: the environment names the history move of an action and what each move would load', async () => {
  const { options } = harness()
  const env = await launchBrowserEnvironment(options)
  try {
    assert.equal(env.historyAction({ type: 'keypress', keys: ['F5'] }), 'reload')
    assert.equal(env.historyAction({ type: 'keypress', keys: ['ALT', 'ARROWLEFT'] }), 'back')
    assert.equal(env.historyAction({ type: 'keypress', keys: ['META', ']'] }), 'forward')
    assert.equal(env.historyAction({ type: 'keypress', keys: ['META', 'A'] }), null)
    assert.equal(env.historyAction({ type: 'click', x: 1, y: 1 }), null)
    // CU-158: the mouse's back and forward buttons move history like the chords; other buttons and clicks do not.
    assert.equal(env.historyAction({ type: 'click', x: 1, y: 1, button: 'back' }), 'back')
    assert.equal(env.historyAction({ type: 'click', x: 1, y: 1, button: 'forward' }), 'forward')
    for (const button of ['left', 'right', 'middle']) assert.equal(env.historyAction({ type: 'click', x: 1, y: 1, button }), null, button)
    assert.equal(env.historyAction({ type: 'double_click', x: 1, y: 1, button: 'back' }), null, 'a double click is planned with the left button')
    assert.deepEqual(env.state().history, { current: null, back: null, forward: null }, 'nothing seen loading: unknown, judged as before')
  } finally {
    await env.close()
  }
})

test('CU-155: a certificate or Safe Browsing warning (committed chrome-error://) is state().interstitial, though state().url is the attempted URL', async () => {
  const { options, connection } = harness()
  const env = await launchBrowserEnvironment(options)
  try {
    assert.equal(env.state().interstitial, false, 'an ordinary page')
    const page = env.session.foreground()
    // What real Chrome sent for a self-signed certificate (probe, 2026-11-07): the main frame commits Chrome's own page,
    // then Target.targetInfoChanged names the attempted URL, which is what state().url reports.
    connection.emit('Page.frameNavigated', { frame: { id: page.mainFrameId, loaderId: 'E1', url: 'chrome-error://chromewebdata/', unreachableUrl: 'http://127.0.0.1:43117/pay' } }, 'S1')
    connection.emit('Target.targetInfoChanged', { targetInfo: { targetId: page.targetId, url: 'http://127.0.0.1:43117/pay', title: '127.0.0.1:43117' } })
    await new Promise((resolve) => setImmediate(resolve))
    const state = env.state()
    assert.deepEqual([state.url, state.interstitial], ['http://127.0.0.1:43117/pay', true], 'the URL check alone (chrome-error:) would miss it')
  } finally {
    await env.close()
  }
})

test('CU-157: a target carries textEntered from the page script - strictly true or false, anything else or a failure null; outside the fingerprint', async () => {
  let entered = true
  // The page tree DOM.describeNode answers with pierce: a closed shadow root holding a textarea makes 'false' unknown.
  let pierced = { nodeName: '#document', children: [{ nodeName: 'BUTTON', attributes: [] }] }
  const { options } = harness({
    handlers: {
      'DOM.getNodeForLocation': () => ({ result: { backendNodeId: 41, frameId: 'F-S1' } }),
      'DOM.describeNode': (params) => {
        if (params?.pierce && pierced instanceof Error) throw pierced
        return { result: { node: params?.pierce ? pierced : { nodeName: 'BUTTON', attributes: [] } } }
      },
      'Runtime.evaluate': () => ({ result: { result: { objectId: 'doc-1' } } }),
      'Accessibility.getPartialAXTree': () => ({ result: { nodes: [{ backendDOMNodeId: 41, role: { value: 'button' }, name: { value: 'Reply' } }] } }),
      'DOM.getBoxModel': () => ({ result: { model: { border: [20, 420, 120, 420, 120, 450, 20, 450] } } }),
      'DOM.resolveNode': () => ({ result: { object: { objectId: 'o1' } } }),
      'Runtime.callFunctionOn': ({ functionDeclaration }) => {
        if (!String(functionDeclaration).includes('function textEntered')) return { result: { result: { value: { origin: 'http://127.0.0.1:43117', editable: false, href: null } } } }
        if (entered instanceof Error) throw entered
        return { result: { result: { value: entered } } }
      },
    },
  })
  const env = await launchBrowserEnvironment(options)
  try {
    const filled = await env.inspectPoint({ x: 50, y: 326 })
    assert.equal(filled.textEntered, true, 'the page holds typed text')
    entered = false
    const empty = await env.inspectPoint({ x: 50, y: 326 })
    assert.equal(empty.textEntered, false, 'nothing typed on the page')
    assert.equal(empty.fingerprint, filled.fingerprint, 'context, not identity: the same node keeps its fingerprint')
    pierced = { nodeName: '#document', children: [{ nodeName: 'X-COMPOSER', attributes: [], shadowRoots: [{ nodeName: '#document-fragment', shadowRootType: 'closed', children: [{ nodeName: 'TEXTAREA', attributes: [] }] }] }] }
    assert.equal((await env.inspectPoint({ x: 50, y: 326 })).textEntered, null, 'a closed shadow root holding a text entry was not read: unknown, never false')
    pierced = { nodeName: '#document', children: [{ nodeName: 'INPUT', attributes: ['type', 'text'], shadowRoots: [{ nodeName: '#document-fragment', shadowRootType: 'user-agent', children: [{ nodeName: 'DIV', attributes: [] }] }] }] }
    assert.equal((await env.inspectPoint({ x: 50, y: 326 })).textEntered, false, 'a native input\'s user-agent root is not a closed root')
    pierced = new Error('describeNode failed')
    assert.equal((await env.inspectPoint({ x: 50, y: 326 })).textEntered, null, 'the closed-root check failing: unknown, never false')
    pierced = { nodeName: '#document', children: [] }
    entered = 'yes'
    assert.equal((await env.inspectPoint({ x: 50, y: 326 })).textEntered, null, 'a non-boolean is unknown')
    entered = new Error('frame gone')
    assert.equal((await env.inspectPoint({ x: 50, y: 326 })).textEntered, null, 'a failed read is unknown (asks), never false')
  } finally {
    await env.close()
  }
})

test('CU-187: a target carries the page script\'s caption - a string clipped to 80, anything else null; outside the fingerprint', async () => {
  let caption = 'IBAN'
  const { options } = harness({
    handlers: {
      'DOM.getNodeForLocation': () => ({ result: { backendNodeId: 42, frameId: 'F-S1' } }),
      'DOM.describeNode': () => ({ result: { node: { nodeName: 'SPAN', attributes: [] } } }),
      'Runtime.evaluate': () => ({ result: { result: { objectId: 'doc-1' } } }),
      'Accessibility.getPartialAXTree': () => ({ result: { nodes: [{ backendDOMNodeId: 42, role: { value: 'generic' }, name: { value: '' } }] } }),
      'DOM.getBoxModel': () => ({ result: { model: { border: [20, 420, 120, 420, 120, 450, 20, 450] } } }),
      'DOM.resolveNode': () => ({ result: { object: { objectId: 'o2' } } }),
      'Runtime.callFunctionOn': ({ functionDeclaration }) => (String(functionDeclaration).includes('function textEntered')
        ? { result: { result: { value: false } } }
        : { result: { result: { value: { origin: 'http://127.0.0.1:43117', editable: false, href: null, caption } } } }),
    },
  })
  const env = await launchBrowserEnvironment(options)
  try {
    const labelled = await env.inspectPoint({ x: 50, y: 326 })
    assert.equal(labelled.caption, 'IBAN')
    const prints = new Set([labelled.fingerprint])
    for (const [value, want] of [[null, null], ['', null], [42, null], [{ text: 'IBAN' }, null], ['x'.repeat(120), 'x'.repeat(80)]]) {
      caption = value
      const target = await env.inspectPoint({ x: 50, y: 326 })
      assert.equal(target.caption, want, JSON.stringify(value))
      prints.add(target.fingerprint)
    }
    assert.equal(prints.size, 1, 'context, not identity: the same node keeps its fingerprint whatever its caption')
  } finally {
    await env.close()
  }
})

test('CU-187: selectionSource is { role, tag, origin, caption } of the selection\'s element - never a name, which is the value itself; null with no selection or the page itself', async () => {
  let selected = true
  let nodeName = 'SPAN'
  const { options } = harness({
    handlers: {
      'Runtime.evaluate': ({ expression } = {}) => (String(expression).includes('function selectionContainer')
        ? { result: { result: selected ? { type: 'object', objectId: 'sel-1' } : { type: 'object', subtype: 'null', value: null } } }
        : { result: { result: { objectId: 'doc-1' } } }),
      'DOM.describeNode': () => ({ result: { node: { backendNodeId: 43, nodeName, attributes: [] } } }),
      'Accessibility.getPartialAXTree': () => ({ result: { nodes: [{ backendDOMNodeId: 43, role: { value: 'generic' }, name: { value: IBAN_DE_COMPACT } }] } }),
      'DOM.getBoxModel': () => ({ result: { model: { border: [20, 420, 120, 420, 120, 450, 20, 450] } } }),
      'DOM.resolveNode': () => ({ result: { object: { objectId: 'o3' } } }),
      'Runtime.callFunctionOn': () => ({ result: { result: { value: { origin: 'http://127.0.0.1:43117', editable: false, href: null, caption: 'IBAN' } } } }),
    },
  })
  const env = await launchBrowserEnvironment(options)
  try {
    const source = await env.selectionSource()
    assert.deepEqual(source, { role: 'generic', tag: 'span', origin: 'http://127.0.0.1:43117', caption: 'IBAN' })
    assert.equal(JSON.stringify(source).includes('DE89'), false, 'the value - the static text\'s own name - never leaves the driver here')
    selected = false
    assert.equal(await env.selectionSource(), null, 'nothing selected')
    selected = true
    nodeName = 'BODY'
    assert.equal(await env.selectionSource(), null, 'the page itself is no source')
  } finally {
    await env.close()
  }
})

test('CU-198: dragText returns the text under a drag\'s press for the value rules - null with none or a dialog, { unknown: true } when the read fails', async () => {
  let reply = { result: { result: { type: 'string', value: CARD } } }
  let seen = null
  const { connection, options } = harness({
    handlers: {
      'Runtime.evaluate': ({ expression } = {}) => {
        if (String(expression).includes('function dragTextAt')) { seen = String(expression); if (reply instanceof Error) throw reply; return reply }
        return { result: { result: { objectId: 'doc-1' } } }
      },
    },
  })
  const env = await launchBrowserEnvironment(options)
  try {
    assert.equal(await env.dragText({ x: 50, y: 20 }), CARD)
    assert.match(seen, /, \d+(\.\d+)?, \d+(\.\d+)?, 4096\)$/, 'the press point in viewport pixels and the cap travel to the page')
    reply = { result: { result: { type: 'object', subtype: 'null', value: null } } }
    assert.equal(await env.dragText({ x: 50, y: 20 }), null, 'no selection under the press')
    reply = new Error('target closed')
    assert.deepEqual(await env.dragText({ x: 50, y: 20 }), { unknown: true }, 'a failed read is unknown, never empty')
    reply = { result: { result: { type: 'string', value: 'should not be read' } } }
    seen = null
    connection.emit('Page.javascriptDialogOpening', { type: 'confirm', message: 'Send the payment?', url: 'u' }, 'S1')
    assert.equal(await env.dragText({ x: 50, y: 20 }), null, 'a held dialog (an alert is auto-accepted, a confirm is held): nothing can be dragged')
    assert.equal(seen, null, 'and the page is not even read')
  } finally {
    await env.close()
  }
})

test('CU-271: the page script\'s surface flags reach the target (terminal, notebookCell, notebookSurface, codeSurface), outside the fingerprint', async () => {
  let extra = { origin: 'https://nb.example', editable: true, href: null, terminal: true }
  const { options } = harness({
    handlers: {
      'DOM.getNodeForLocation': () => ({ result: { backendNodeId: 7, frameId: 'F-S1' } }),
      'DOM.describeNode': () => ({ result: { node: { nodeName: 'TEXTAREA', attributes: [] } } }),
      'Accessibility.getPartialAXTree': () => ({ result: { nodes: [{ backendDOMNodeId: 7, role: { value: 'textbox' }, name: { value: 'Terminal input' } }] } }),
      'DOM.getBoxModel': () => ({ result: { model: { border: [100, 300, 200, 300, 200, 340, 100, 340] } } }),
      'DOM.resolveNode': () => ({ result: { object: { objectId: 'o1' } } }),
      'Runtime.callFunctionOn': () => ({ result: { result: { value: extra } } }),
    },
  })
  const env = await launchBrowserEnvironment(options)
  const term = await env.inspectPoint({ x: 120, y: 240 })
  assert.equal(term.terminal, true)
  extra = { origin: 'https://nb.example', editable: true, href: null, notebookCell: true, notebookSurface: true, codeSurface: true }
  const cell = await env.inspectPoint({ x: 120, y: 240 })
  assert.deepEqual([cell.terminal, cell.notebookCell, cell.notebookSurface, cell.codeSurface], [undefined, true, true, true])
  assert.equal(cell.fingerprint, term.fingerprint, 'outside the fingerprint')
  extra = { origin: 'https://nb.example', editable: true, href: null, terminal: 'yes' }
  assert.equal((await env.inspectPoint({ x: 120, y: 240 })).terminal, undefined, 'only a true flag counts')
  await env.close()
})

test('CU-265: a target carries its link\'s scheme only (facetime, tel, mailto, https) - never the rest of the href; no link is null', async () => {
  let href = 'facetime://+15550100'
  const { options } = harness({
    handlers: {
      'DOM.getNodeForLocation': () => ({ result: { backendNodeId: 7, frameId: 'F-S1' } }),
      'DOM.describeNode': () => ({ result: { node: { nodeName: 'A', attributes: [] } } }),
      'Accessibility.getPartialAXTree': () => ({ result: { nodes: [{ backendDOMNodeId: 7, role: { value: 'link' }, name: { value: 'Call support' } }] } }),
      'DOM.getBoxModel': () => ({ result: { model: { border: [100, 300, 200, 300, 200, 340, 100, 340] } } }),
      'DOM.resolveNode': () => ({ result: { object: { objectId: 'o1' } } }),
      'Runtime.callFunctionOn': () => ({ result: { result: { value: { origin: 'http://127.0.0.1:43117', editable: false, href } } } }),
    },
  })
  const env = await launchBrowserEnvironment(options)
  const schemeAt = async (value) => { href = value; return (await env.inspectPoint({ x: 120, y: 240 })).linkScheme }
  assert.equal(await schemeAt('facetime://+15550100'), 'facetime')
  assert.equal(await schemeAt('TEL:+15550100'), 'tel', 'lower case')
  assert.equal(await schemeAt('mailto:someone@example.com?subject=x'), 'mailto', 'the scheme only')
  assert.equal(await schemeAt('https://example.com/a'), 'https')
  assert.equal(await schemeAt(null), null, 'not in a link')
  assert.equal(await schemeAt('not a url'), null)
  const first = await env.inspectPoint({ x: 120, y: 240 })
  href = 'zoommtg://zoom.us/join?confno=1'
  assert.equal((await env.inspectPoint({ x: 120, y: 240 })).fingerprint, first.fingerprint, 'outside the fingerprint')
  await env.close()
})

test('CU-400: formContextOf re-validates the page\'s formContext at the boundary', async () => {
  const { formContextOf } = await import('../../_environments_/chrome-browser/environment.mjs')
  assert.deepEqual(formContextOf({ options: ['BTC', 'x'.repeat(30), 7, 'ETH', 'SOL', 'ADA'], amountEntry: true }), { options: ['BTC', 'ETH', 'SOL'], amountEntry: true })
  assert.deepEqual(formContextOf({ options: [], amountEntry: 'yes' }), null)
  assert.equal(formContextOf(null), null)
  assert.equal(formContextOf('BTC'), null)
})

test('CU-406: the Return target (defaultButton) carries the submit button\'s formContext - a bare \'Sell\' default beside an asset select', async () => {
  const handlers = checkoutHandlers()
  const base = handlers['Runtime.callFunctionOn']
  handlers['Runtime.callFunctionOn'] = (params) => (String(params.functionDeclaration).includes('describeElement') && /-41$/.test(String(params.objectId))
    ? { result: { result: { value: { formContext: { options: ['BTC'], amountEntry: true } } } } }
    : base(params))
  const run = harness({ handlers })
  const env = await launchBrowserEnvironment(run.options)
  try {
    const target = await env.focusedElement()
    assert.deepEqual(target.defaultButton, { role: 'button', name: 'Place order', panel: null, formContext: { options: ['BTC'], amountEntry: true } })
    assert.equal('formContext' in target, false, 'the focused field itself carries none')
  } finally {
    await env.close()
  }
})

test('CU-412: a Return whose implicit submission may press one of two script controls carries defaultCandidates [{role, name}] (11:27Z contract)', async () => {
  const handlers = checkoutHandlers({ submit: false })
  const nodes = { 51: { backendNodeId: 51, nodeName: 'DIV', attributes: ['role', 'button'] }, 52: { backendNodeId: 52, nodeName: 'DIV', attributes: ['role', 'button'] } }
  const ax = { 51: 'Buy', 52: 'Delete account' }
  const baseDescribe = handlers['DOM.describeNode']
  handlers['DOM.describeNode'] = (params) => (params.objectId === 'c0' ? { result: { node: nodes[51] } } : params.objectId === 'c1' ? { result: { node: nodes[52] } } : nodes[params.backendNodeId] ? { result: { node: nodes[params.backendNodeId] } } : baseDescribe(params))
  const baseAx = handlers['Accessibility.getPartialAXTree']
  handlers['Accessibility.getPartialAXTree'] = (params) => (ax[params.backendNodeId] ? { result: { nodes: [{ backendDOMNodeId: params.backendNodeId, role: { value: 'button' }, name: { value: ax[params.backendNodeId] } }] } } : baseAx(params))
  const baseCall = handlers['Runtime.callFunctionOn']
  const declarations = []
  handlers['Runtime.callFunctionOn'] = (params) => { declarations.push(String(params.functionDeclaration)); return String(params.functionDeclaration).includes('implicitSubmitControls') && !String(params.functionDeclaration).includes('implicitSubmitButton') ? { result: { result: { type: 'object', subtype: 'array', objectId: 'list' } } } : baseCall(params) }
  handlers['Runtime.getProperties'] = ({ objectId }) => (objectId === 'list' ? { result: { result: [{ name: '0', value: { objectId: 'c0' } }, { name: '1', value: { objectId: 'c1' } }, { name: 'length', value: { value: 2 } }] } } : { result: { result: [] } })
  const run = harness({ handlers })
  const env = await launchBrowserEnvironment(run.options)
  try {
    const target = await env.focusedElement()
    assert.equal(target.defaultButton, null, 'no single control')
    assert.deepEqual(target.defaultCandidates, [{ role: 'button', name: 'Buy' }, { role: 'button', name: 'Delete account' }])
    assert.equal('defaultCandidatesMore' in target, false, 'two: no More flag')
    const buttonRead = declarations.find((d) => d.includes('function implicitSubmitButton'))
    assert.ok(buttonRead && buttonRead.includes('function implicitSubmitControls'), 'the default-button read gets the script-controls reader (one control is the default)')
  } finally {
    await env.close()
  }
})

test('CU-412: more than three script controls list the first three and set defaultCandidatesMore (agent core asks unknown)', async () => {
  const handlers = checkoutHandlers({ submit: false })
  const ids = { c0: 51, c1: 52, c2: 53, c3: 54 }
  const names = { 51: 'Buy', 52: 'Sell', 53: 'Delete account', 54: 'Transfer' }
  const node = (id) => ({ backendNodeId: id, nodeName: 'DIV', attributes: ['role', 'button'] })
  const baseDescribe = handlers['DOM.describeNode']
  handlers['DOM.describeNode'] = (params) => (ids[params.objectId] ? { result: { node: node(ids[params.objectId]) } } : names[params.backendNodeId] ? { result: { node: node(params.backendNodeId) } } : baseDescribe(params))
  const baseAx = handlers['Accessibility.getPartialAXTree']
  handlers['Accessibility.getPartialAXTree'] = (params) => (names[params.backendNodeId] ? { result: { nodes: [{ backendDOMNodeId: params.backendNodeId, role: { value: 'button' }, name: { value: names[params.backendNodeId] } }] } } : baseAx(params))
  const baseCall = handlers['Runtime.callFunctionOn']
  handlers['Runtime.callFunctionOn'] = (params) => (String(params.functionDeclaration).includes('implicitSubmitControls') && !String(params.functionDeclaration).includes('implicitSubmitButton') ? { result: { result: { type: 'object', subtype: 'array', objectId: 'list' } } } : baseCall(params))
  handlers['Runtime.getProperties'] = ({ objectId }) => (objectId === 'list' ? { result: { result: [...Object.keys(ids).map((k, i) => ({ name: String(i), value: { objectId: k } })), { name: 'length', value: { value: 4 } }] } } : { result: { result: [] } })
  const run = harness({ handlers })
  const env = await launchBrowserEnvironment(run.options)
  try {
    const target = await env.focusedElement()
    assert.deepEqual(target.defaultCandidates.map((c) => c.name), ['Buy', 'Sell', 'Delete account'])
    assert.equal(target.defaultCandidatesMore, true)
  } finally {
    await env.close()
  }
})

test('CU-412 fail closed: a candidates read that fails sets defaultCandidatesMore (agent core asks unknown), never silence', async () => {
  const handlers = checkoutHandlers({ submit: false })
  const baseCall = handlers['Runtime.callFunctionOn']
  handlers['Runtime.callFunctionOn'] = (params) => (String(params.functionDeclaration).includes('implicitSubmitControls') && !String(params.functionDeclaration).includes('implicitSubmitButton') ? { result: { result: { type: 'object', subtype: 'array', objectId: 'list' } } } : baseCall(params))
  handlers['Runtime.getProperties'] = ({ objectId }) => (objectId === 'list' ? { result: { result: [{ name: '0', value: { objectId: 'c0' } }, { name: '1', value: { objectId: 'c1' } }, { name: 'length', value: { value: 2 } }] } } : { result: { result: [] } })
  const baseDescribe = handlers['DOM.describeNode']
  handlers['DOM.describeNode'] = (params) => { if (params.objectId === 'c0' || params.objectId === 'c1') throw new Error('node gone'); return baseDescribe(params) }
  const run = harness({ handlers })
  const env = await launchBrowserEnvironment(run.options)
  try {
    const target = await env.focusedElement()
    assert.equal(target.defaultButton, null)
    assert.equal(target.defaultCandidatesMore, true)
  } finally {
    await env.close()
  }
})

test('CU-412 (11:56Z): a nameless candidate is unreadable - [Cancel, icon-only] lists Cancel and sets defaultCandidatesMore', async () => {
  const handlers = checkoutHandlers({ submit: false })
  const node = (id) => ({ backendNodeId: id, nodeName: 'DIV', attributes: ['role', 'button'] })
  const names = { 51: 'Cancel', 52: '' }
  const baseDescribe = handlers['DOM.describeNode']
  handlers['DOM.describeNode'] = (params) => (params.objectId === 'c0' ? { result: { node: node(51) } } : params.objectId === 'c1' ? { result: { node: node(52) } } : names[params.backendNodeId] !== undefined ? { result: { node: node(params.backendNodeId) } } : baseDescribe(params))
  const baseAx = handlers['Accessibility.getPartialAXTree']
  handlers['Accessibility.getPartialAXTree'] = (params) => (names[params.backendNodeId] !== undefined ? { result: { nodes: [{ backendDOMNodeId: params.backendNodeId, role: { value: 'button' }, name: { value: names[params.backendNodeId] } }] } } : baseAx(params))
  const baseCall = handlers['Runtime.callFunctionOn']
  handlers['Runtime.callFunctionOn'] = (params) => (String(params.functionDeclaration).includes('implicitSubmitControls') && !String(params.functionDeclaration).includes('implicitSubmitButton') ? { result: { result: { type: 'object', subtype: 'array', objectId: 'list' } } } : baseCall(params))
  handlers['Runtime.getProperties'] = ({ objectId }) => (objectId === 'list' ? { result: { result: [{ name: '0', value: { objectId: 'c0' } }, { name: '1', value: { objectId: 'c1' } }] } } : { result: { result: [] } })
  const run = harness({ handlers })
  const env = await launchBrowserEnvironment(run.options)
  try {
    const target = await env.focusedElement()
    assert.deepEqual(target.defaultCandidates, [{ role: 'button', name: 'Cancel' }])
    assert.equal(target.defaultCandidatesMore, true, 'the icon-only control is unreadable, never dropped')
  } finally {
    await env.close()
  }
})

test('CU-412 (11:56Z): a lone script control with no accessible name is no default - defaultCandidatesMore (unknown); a nameless real submit keeps the CU-150 path', async () => {
  for (const script of [true, false]) {
    const handlers = checkoutHandlers({ submit: true })
    const baseAx = handlers['Accessibility.getPartialAXTree']
    handlers['Accessibility.getPartialAXTree'] = (params) => { const r = baseAx(params); const n = r?.result?.nodes?.[0]; return n && n.role?.value === 'button' ? { result: { nodes: [{ ...n, name: { value: '' } }] } } : r }
    const baseCall = handlers['Runtime.callFunctionOn']
    handlers['Runtime.callFunctionOn'] = (params) => (String(params.functionDeclaration).includes("this.tagName === 'BUTTON' && t === 'submit'") && params.returnByValue === true ? { result: { result: { type: 'boolean', value: script } } } : baseCall(params))
    const run = harness({ handlers })
    const env = await launchBrowserEnvironment(run.options)
    try {
      const target = await env.focusedElement()
      if (script) {
        assert.equal(target.defaultButton, null, 'a nameless script control is no default')
        assert.equal(target.defaultCandidatesMore, true)
      } else {
        assert.notEqual(target.defaultButton, null, 'a nameless real submit stays the default (CU-150)')
        assert.equal('defaultCandidatesMore' in target, false)
      }
    } finally {
      await env.close()
    }
  }
})

test('CU-443: rowContextOf re-validates the page\'s rowContext at the boundary', async () => {
  const { rowContextOf } = await import('../../_environments_/chrome-browser/environment.mjs')
  assert.deepEqual(rowContextOf({ list: 'Contacts', hints: ['Call', 7, 'x'.repeat(41), 'Message', 'Video', 'More'] }), { list: 'Contacts', hints: ['Call', 'Message', 'Video'] })
  assert.deepEqual(rowContextOf({ list: 'z'.repeat(61), hints: [] }), null, 'an over-long list name is dropped; nothing left')
  assert.equal(rowContextOf(null), null)
  assert.equal(rowContextOf('Contacts'), null)
})

test('CU-473 (Return route): the Return target (defaultButton) carries the submit button\'s firstLine, as a click on it would', async () => {
  const handlers = checkoutHandlers()
  const base = handlers['Runtime.callFunctionOn']
  handlers['Runtime.callFunctionOn'] = (params) => (String(params.functionDeclaration).includes('describeElement') && /-41$/.test(String(params.objectId))
    ? { result: { result: { value: { firstLine: 'Change Direct Deposit' } } } }
    : base(params))
  const run = harness({ handlers })
  const env = await launchBrowserEnvironment(run.options)
  try {
    const target = await env.focusedElement()
    assert.deepEqual(target.defaultButton, { role: 'button', name: 'Place order', panel: null, firstLine: 'Change Direct Deposit' })
    assert.equal('firstLine' in target, false, 'the focused field itself carries none')
  } finally {
    await env.close()
  }
})

test('CU-494: an entry carries its raw name (else id) attribute as fieldAttr; a non-token value and a non-entry carry none', async () => {
  const describe = async (attributes, axName, editable = true) => {
    const { options } = harness({
      handlers: {
        'DOM.getNodeForLocation': () => ({ result: { backendNodeId: 31, frameId: 'F-S1' } }),
        'DOM.describeNode': () => ({ result: { node: { nodeName: 'INPUT', attributes } } }),
        'Accessibility.getPartialAXTree': () => ({ result: { nodes: [{ backendDOMNodeId: 31, role: { value: 'textbox' }, name: { value: axName } }] } }),
        'DOM.getBoxModel': () => ({ result: { model: { border: [20, 420, 320, 420, 320, 450, 20, 450] } } }),
        'DOM.resolveNode': () => ({ result: { object: { objectId: 'o1' } } }),
        'Runtime.callFunctionOn': () => ({ result: { result: { value: { origin: 'http://127.0.0.1:43117', editable, href: null } } } }),
      },
    })
    const env = await launchBrowserEnvironment(options)
    try { return await env.inspectPoint({ x: 127, y: 326 }) } finally { await env.close() }
  }
  assert.equal((await describe(['type', 'text', 'name', 'iban'], '')).fieldAttr, 'iban')
  assert.equal((await describe(['type', 'text', 'name', 'Wallet_Address'], '')).fieldAttr, 'wallet_address', 'lower-cased')
  assert.equal((await describe(['type', 'text', 'id', 'routing-number'], '')).fieldAttr, 'routing-number', 'id when no name')
  assert.equal((await describe(['type', 'text', 'name', 'BankAccountNumber'], '')).fieldAttr, 'bank_account_number', 'camelCase keeps its word breaks')
  assert.equal((await describe(['type', 'text', 'name', 'IBANNumber'], '')).fieldAttr, 'iban_number', 'an acronym run keeps its break')
  assert.equal((await describe(['type', 'text', 'name', 'iban'], 'Nickname')).fieldAttr, 'iban', 'a named entry carries it too (#675 r2: a union)')
  assert.equal('fieldAttr' in (await describe(['type', 'text', 'name', 'a b<c>'], '')), false, 'not a plain token')
  assert.equal('fieldAttr' in (await describe(['type', 'text', 'name', 'x'.repeat(41)], '')), false, 'over 40 characters')
  assert.equal('fieldAttr' in (await describe(['type', 'button', 'name', 'iban'], '', false)), false, 'not an entry')
  const a = await describe(['type', 'text', 'name', 'iban'], '')
  const b = await describe(['type', 'text', 'name', 'wallet'], '')
  assert.equal(a.fingerprint, b.fingerprint, 'outside the fingerprint')
})

test('CU-507: dialogContextOf re-validates the page value (kind, bounded strings) and drops anything else', async () => {
  const { dialogContextOf } = await import('../../_environments_/chrome-browser/environment.mjs')
  assert.deepEqual(dialogContextOf({ kind: 'alertdialog', name: ' Delete  account? ', description: 'Gone for good.' }), { kind: 'alertdialog', name: 'Delete account?', description: 'Gone for good.' })
  assert.equal(dialogContextOf({ kind: 'region', name: 'x' }), null, 'unknown kind')
  assert.equal(dialogContextOf({ kind: 'dialog' }), null, 'no text')
  assert.equal(dialogContextOf({ kind: 'dialog', name: 'n'.repeat(200) }).name.length, 80)
  assert.equal(dialogContextOf({ kind: 'dialog', name: 7, description: 'd'.repeat(400) }).description.length, 160)
  assert.equal(dialogContextOf(null), null)
})
