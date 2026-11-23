import assert from 'node:assert/strict'
import { test } from 'node:test'

import { FRAME_FOCUS_MS, launchBrowserEnvironment } from '../../_environments_/chrome-browser/environment.mjs'
import { describeElement, frameLabel, frameLabelFromAttributes } from '../../_environments_/chrome-browser/page-scripts.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { FakeConnection } from './fake-cdp.mjs'

// CU-300 (frame-focus.md): focusedElement follows the focus into a cross-site iframe through the frame's own session,
// keeping the iframe element whenever that read fails; framed targets carry frameUrl and frameHost; every focus says
// whether its default-button read ran (defaultButtonRead).

const PAGE = 'S1'
const FRAME = 'S1-F1'
const HOST = { nodeName: 'IFRAME', backendNodeId: 40, frameId: 'OOPIF-1', attributes: ['title', 'Secure CVC input frame'] }
const NODES = {
  [FRAME]: {
    5: { nodeName: 'INPUT', backendNodeId: 5, attributes: ['type', 'text', 'autocomplete', 'cc-csc'] },
    6: { nodeName: 'BUTTON', backendNodeId: 6, attributes: ['type', 'submit'] },
    7: { nodeName: 'BODY', backendNodeId: 7, attributes: [] },
    8: { nodeName: 'IFRAME', backendNodeId: 8, frameId: 'OOPIF-2', attributes: ['title', 'Bank challenge'] },
    // #171's card-frames entry: no label, placeholder, aria-label or autocomplete - only its frame's title names it.
    9: { nodeName: 'INPUT', backendNodeId: 9, attributes: ['type', 'text'] },
  },
  [PAGE]: { 40: HOST, 41: { nodeName: 'INPUT', backendNodeId: 41, attributes: ['type', 'email'] } },
}
const AX = {
  [PAGE]: { 40: { role: 'Iframe', name: 'Secure CVC input frame' }, 41: { role: 'textbox', name: 'Email' } },
  [FRAME]: { 5: { role: 'textbox', name: 'CVC' }, 6: { role: 'button', name: 'Pay' }, 7: { role: 'generic', name: '' }, 8: { role: 'Iframe', name: 'Bank challenge' }, 9: { role: 'textbox', name: '' } },
}

/**
 * A page S1 whose focus is the cross-site iframe 40 (frame OOPIF-1, content box at viewport (200, 100)), and the
 * frame's session S1-F1. `world` steers the frame's side: what its focus is, whether it answers, whether its nodes resolve.
 */
function harness(world) {
  const idOf = (params) => params.backendNodeId ?? Number(String(params.objectId ?? '').replace(/^node-/, ''))
  const connection = new FakeConnection({
    'Runtime.evaluate': (params, sessionId) => {
      if (sessionId === PAGE) return { result: { result: world.pageFocus === null ? { type: 'object', subtype: 'null', value: null } : { type: 'object', objectId: `node-${world.pageFocus ?? 40}` } } }
      if (sessionId === FRAME && String(params.expression).includes('requestAnimationFrame')) {
        world.settles = (world.settles ?? 0) + 1
        return { result: { result: { type: 'boolean', value: true } } }
      }
      if (sessionId === FRAME) return world.frameFocus(params)
      return { result: { result: { value: true } } }
    },
    'DOM.describeNode': (params, sessionId) => ({ result: { node: NODES[sessionId]?.[idOf(params)] ?? NODES[sessionId]?.[5] } }),
    'DOM.getNodeForLocation': (params, sessionId) => ({ result: sessionId === FRAME ? { backendNodeId: 5, frameId: 'OOPIF-1' } : { backendNodeId: 40, frameId: `F-${PAGE}` } }),
    'DOM.getBoxModel': (params, sessionId) => ({
      result: { model: sessionId === FRAME ? { border: [20, 30, 120, 30, 120, 70, 20, 70] } : { content: [200, 100, 600, 100, 600, 400, 200, 400], border: [190, 90, 610, 90, 610, 410, 190, 410] } },
    }),
    'Accessibility.getPartialAXTree': (params, sessionId) => {
      // CU-336: world.hostAxFails makes the page's read of the host iframe throw (an AX failure).
      if (sessionId === PAGE && world.hostAxFails && params.backendNodeId === 40) throw Object.assign(new Error('No node with given id found'), { code: -32000 })
      const ax = AX[sessionId]?.[params.backendNodeId] ?? { role: null, name: '' }
      return { result: { nodes: [{ backendDOMNodeId: params.backendNodeId, role: { value: ax.role }, name: { value: ax.name } }] } }
    },
    'DOM.resolveNode': (params, sessionId) => {
      if (sessionId === FRAME && world.resolveFails) throw Object.assign(new Error('Cannot find context with specified id'), { code: -32000 })
      if (sessionId === PAGE && world.pageResolveFails && params.backendNodeId === 40) throw Object.assign(new Error('Cannot find context with specified id'), { code: -32000 })
      return { result: { object: { objectId: `node-${params.backendNodeId}` } } }
    },
    'Runtime.callFunctionOn': (params, sessionId) => {
      const fn = params.functionDeclaration
      // CU-336's frameLabel on the host: what the page gives the iframe element, as world.hostLabel says.
      if (fn.includes('function frameLabel')) return { result: { result: { value: world.hostLabel ?? null } } }
      // CU-319's read, inside the frame only when world.frameAutofill lists backend ids of the frame's autofilled fields.
      if (fn.includes(':-webkit-autofill')) return { result: { result: sessionId === FRAME && Array.isArray(world.frameAutofill) ? { type: 'object', objectId: 'scope-1' } : { type: 'object', subtype: 'null', value: null } } }
      if (fn.includes('return this.truncated')) return { result: { result: { type: 'boolean', value: false } } }
      if (fn.includes('return this.edited')) return { result: { result: { type: 'object', value: world.frameAutofill.map(() => false) } } }
      if (fn.includes('return this.fields')) return { result: { result: { type: 'object', subtype: 'array', objectId: 'fields-1' } } }
      if (fn.includes('IMPLICIT')) return { result: { result: sessionId === FRAME && world.submit !== false && params.objectId === 'node-5' ? { type: 'object', objectId: 'node-6' } : { type: 'object', subtype: 'null', value: null } } }
      if (fn.includes('CONTROL_ROLES') && params.returnByValue === false) return { result: { result: { type: 'object', objectId: params.objectId } } }
      if (fn.includes('function (target)')) return { result: { result: { value: null } } }
      if (fn.includes('NOT_TEXT_INPUTS')) {
        const id = Number(params.objectId.replace(/^node-/, ''))
        if (sessionId !== FRAME) return { result: { result: { value: { origin: 'http://127.0.0.1:43117', editable: id === 41, href: null } } } }
        const editable = id === 5 || id === 9 || (id === 7 && world.bodyEditable === true)
        return { result: { result: { value: { origin: 'https://pay.example', frameUrl: 'https://pay.example/elements/inner', editable, href: null } } } }
      }
      return { result: { result: { value: false } } }
    },
    'Runtime.getProperties': () => ({ result: { result: (world.frameAutofill ?? []).map((id, index) => ({ name: String(index), value: { type: 'object', objectId: `node-${id}` } })) } }),
    'Page.getFrameTree': (params, sessionId) => ({ result: { frameTree: { frame: sessionId === FRAME ? { id: 'OOPIF-1', loaderId: 'L-A' } : { id: `F-${sessionId}`, loaderId: `L-${sessionId}` } } } }),
    'DOM.enable': (params, sessionId) => (sessionId === FRAME && world.frameStalls ? new Promise(() => {}) : { result: {} }),
  })
  const options = {
    seat: 'cu-test-seat',
    viewport: { width: 1280, height: 800 },
    frame: { maxWidth: 960 },
    sitePolicy: (url) => (url.startsWith('http://127.0.0.1:43117') ? 'allow' : { block: 'not_allowed' }),
    isFixedDenied: () => false,
    resourceGate: async () => ({ setChromePid: () => {}, release: () => {} }),
    proxy: false,
    startChrome: async () => ({ wsUrl: 'ws://fake', child: { pid: 4242 }, profile: '/tmp/cu-test-seat-chrome-abcdef', stderr: () => '', stop: async () => {} }),
    connect: async () => connection,
  }
  const attach = async (env) => {
    connection.emit('Target.attachedToTarget', { sessionId: FRAME, targetInfo: { type: 'iframe', targetId: 'OOPIF-1', url: 'https://pay.example/elements/inner?token=abc' }, waitingForDebugger: true }, PAGE)
    if (!world.frameStalls) await env.session.foreground().frameSessions.get('OOPIF-1').ready
  }
  return { connection, options, attach }
}

const focusOn = (id) => () => ({ result: { result: { type: 'object', objectId: `node-${id}` } } })

test('CU-300: the focus is followed into the cross-site frame - the inner field, its frameUrl, frameHost and the frame\'s own default button, with the fingerprint and fieldKey the click gave', async () => {
  const world = { frameFocus: focusOn(5) }
  const { connection, options, attach } = harness(world)
  const env = await launchBrowserEnvironment(options)
  await attach(env)
  const focused = await env.focusedElement()
  assert.deepEqual([focused.tag, focused.role, focused.name, focused.autocomplete, focused.origin], ['input', 'textbox', 'CVC', 'cc-csc', 'https://pay.example'])
  assert.equal(focused.frameUrl, 'https://pay.example/elements/inner')
  assert.deepEqual(focused.frameHost, { tag: 'iframe', role: 'Iframe', name: 'Secure CVC input frame' }, "the host's facts, which the frame-host rules read")
  assert.deepEqual([focused.defaultButton, focused.defaultButtonRead], [{ role: 'button', name: 'Pay', panel: null }, true], "the frame's own form, read in its world")
  assert.ok(connection.of('Runtime.callFunctionOn', FRAME).some((call) => call.params.functionDeclaration.includes('IMPLICIT')))
  assert.deepEqual(focused.box, { x: 165, y: 97.5, width: 75, height: 30 }, 'the box moved back by the content origin, in frame pixels')
  // The click on the same field (frame (240, 120) is viewport (320, 160), inside the content box) keys it alike.
  const clicked = await env.inspectPoint({ x: 240, y: 120 })
  assert.equal(clicked.fingerprint, focused.fingerprint, 'one field, one fingerprint, from either method')
  assert.match(focused.fieldKey, /^[0-9a-f]{32}$/)
  assert.equal(clicked.fieldKey, focused.fieldKey)
  assert.deepEqual(clicked.frameHost, focused.frameHost, 'inspectPoint through the frame names the host too')
  assert.equal(clicked.frameUrl, 'https://pay.example/elements/inner')
  // Before the follow existed the answer was the host: a focus that moves between proposal and recheck changes it.
  world.frameFocus = () => ({ result: { result: { type: 'object', subtype: 'null', value: null } } })
  assert.notEqual((await env.focusedElement()).fingerprint, focused.fingerprint, 'host and inner field never share a fingerprint')
  await env.close()
})

test('CU-300: every failed read keeps the iframe element - no frame session, a protocol error, a plain body, a read past the bound', async () => {
  const world = { frameFocus: focusOn(5) }
  const { options, attach } = harness(world)
  const env = await launchBrowserEnvironment(options)
  const host = await env.focusedElement()
  assert.deepEqual([host.tag, host.role, host.name, host.frameHost, host.frameUrl], ['iframe', 'Iframe', 'Secure CVC input frame', undefined, undefined], 'no frame session: the host, as before')
  await attach(env)
  world.frameFocus = () => { throw Object.assign(new Error('Target closed'), { code: -32000 }) }
  assert.equal((await env.focusedElement()).fingerprint, host.fingerprint, 'a protocol error: the host')
  world.frameFocus = () => ({ result: { result: { type: 'object', subtype: 'null', value: null } } })
  assert.equal((await env.focusedElement()).fingerprint, host.fingerprint, 'nothing focused inside but a plain body: the host')
  world.frameFocus = focusOn(7)
  world.bodyEditable = false
  assert.equal((await env.focusedElement()).fingerprint, host.fingerprint, 'a body that takes no text: the host')
  world.frameFocus = () => new Promise(() => {})
  const began = Date.now()
  assert.equal((await env.focusedElement()).fingerprint, host.fingerprint, 'a read that never answers: the host at the bound')
  const took = Date.now() - began
  assert.ok(took >= FRAME_FOCUS_MS - 50 && took < FRAME_FOCUS_MS + 1500, `bounded: ${took} ms`)
  await env.close()
})

test("CU-300: a frame whose renderer has not yet handled the click is read again after two of its animation frames (real Chrome raced it)", async () => {
  let reads = 0
  const isFocusRead = (params) => String(params?.expression).includes('designMode')
  const world = { frameFocus: (params) => (isFocusRead(params) && ++reads === 1 ? { result: { result: { type: 'object', subtype: 'null', value: null } } } : focusOn(5)()) }
  const { options, attach } = harness(world)
  const env = await launchBrowserEnvironment(options)
  await attach(env)
  const focused = await env.focusedElement()
  assert.deepEqual([focused.tag, focused.name, reads, world.settles], ['input', 'CVC', 2, 1], 'nothing focused at first; after the settle the inner field')
  reads = 0
  world.frameFocus = (params) => { if (isFocusRead(params)) reads += 1; return { result: { result: { type: 'object', subtype: 'null', value: null } } } }
  assert.deepEqual([(await env.focusedElement()).tag, reads], ['iframe', 2], 'still nothing inside after the settle: the host, after exactly one more read')
  await env.close()
})

test('CU-300: a frame session not yet ready is waited for only up to the bound, then the host', async () => {
  const world = { frameFocus: focusOn(5), frameStalls: true }
  const { options, attach } = harness(world)
  const env = await launchBrowserEnvironment(options)
  await attach(env)
  const began = Date.now()
  const focused = await env.focusedElement()
  assert.equal(focused.tag, 'iframe')
  assert.ok(Date.now() - began < FRAME_FOCUS_MS + 1500)
  await env.close()
})

test('CU-300: an editable frame body (an iframe editor) is an editable target named from its host', async () => {
  const world = { frameFocus: focusOn(7), bodyEditable: true }
  const { options, attach } = harness(world)
  const env = await launchBrowserEnvironment(options)
  await attach(env)
  const focused = await env.focusedElement()
  assert.deepEqual([focused.tag, focused.editable, focused.name, focused.frameHost.name], ['body', true, 'Secure CVC input frame', 'Secure CVC input frame'])
  await env.close()
})

test('CU-300: a failed default-button read says so (defaultButtonRead false) - in the frame and on the page; a good read of none is true', async () => {
  const world = { frameFocus: focusOn(5), resolveFails: true }
  const { options, attach } = harness(world)
  const env = await launchBrowserEnvironment(options)
  await attach(env)
  const framed = await env.focusedElement()
  assert.deepEqual([framed.tag, framed.defaultButton, framed.defaultButtonRead, framed.textEntered], ['input', null, false, null], 'unread: CU-190 asks the Return as submit')
  world.resolveFails = false
  world.submit = false
  assert.deepEqual([(await env.focusedElement()).defaultButton, (await env.focusedElement()).defaultButtonRead], [null, true], 'read, and there is none')
  world.pageFocus = 41
  const onPage = await env.focusedElement()
  assert.deepEqual([onPage.tag, onPage.name, onPage.defaultButton, onPage.defaultButtonRead, onPage.frameUrl, onPage.frameHost], ['input', 'Email', null, true, undefined, undefined], 'a top-document field: read, no frame facts')
  await env.close()
})

test('CU-300: one level only - a cross-site frame focused inside the frame is its own iframe element, with the outer frame\'s frameUrl and frameHost (the 3-D Secure case)', async () => {
  const world = { frameFocus: focusOn(8) }
  const { options, attach } = harness(world)
  const env = await launchBrowserEnvironment(options)
  await attach(env)
  const focused = await env.focusedElement()
  assert.deepEqual([focused.tag, focused.role, focused.name, focused.frameUrl, focused.frameHost.name], ['iframe', 'Iframe', 'Bank challenge', 'https://pay.example/elements/inner', 'Secure CVC input frame'])
  await env.close()
})

test("CU-300: the inner field keeps its own name - named or not, the host's name never replaces it (only an editable body takes it)", async () => {
  const world = { frameFocus: focusOn(5) }
  const { options, attach } = harness(world)
  const saved = AX[FRAME][5]
  try {
    const env = await launchBrowserEnvironment(options)
    await attach(env)
    AX[FRAME][5] = { role: 'textbox', name: 'Card number' }
    const named = await env.focusedElement()
    assert.deepEqual([named.name, named.frameHost.name], ['Card number', 'Secure CVC input frame'], 'its own name; the host apart, for the policy to judge both')
    AX[FRAME][5] = { role: 'textbox', name: '' }
    const unnamed = await env.focusedElement()
    assert.deepEqual([unnamed.name, unnamed.frameHost.name], ['', 'Secure CVC input frame'], 'unnamed stays unnamed: the fingerprint matches the click, the host name stays in frameHost')
    assert.equal((await env.inspectPoint({ x: 240, y: 120 })).fingerprint, unnamed.fingerprint)
    await env.close()
  } finally {
    AX[FRAME][5] = saved
  }
})

test("CU-300 end to end: the driver's own answers, judged by agent core's policy, never weaker than the frame-host rules (B1)", async () => {
  const policy = createPolicy({ sitePolicy: () => 'allow' })
  const judge = (action, target) => {
    const verdict = policy.classify(action, { url: 'https://shop.example/checkout', target })
    return verdict.decision === 'allow' ? 'allow' : verdict.class
  }
  const world = { frameFocus: focusOn(9) }
  const { options, attach } = harness(world)
  const saved = AX[FRAME][9]
  const savedHost = AX[PAGE][40]
  try {
    const env = await launchBrowserEnvironment(options)
    await attach(env)
    AX[PAGE][40] = { role: 'Iframe', name: 'Secure Credit Card Frame - CVV' }
    world.submit = false
    const cvv = await env.focusedElement()
    assert.equal(cvv.name, '', "the inner field is unnamed (#171's card-frames entries)")
    assert.equal(judge({ type: 'type', text: '123' }, cvv), 'sensitive_data', 'typed: the host name still asks')
    assert.equal(judge({ type: 'keypress', keys: ['1'] }, cvv), 'sensitive_data', 'pressed key by key (CU-301): the host name still asks')
    assert.equal(judge({ type: 'keypress', keys: ['ENTER'] }, cvv), 'allow', 'a Return after a good read of no default button')
    world.resolveFails = true
    const unread = await env.focusedElement()
    assert.equal(unread.defaultButtonRead, false)
    // Since CU-319 (#200, #195) the same failed read also leaves the autofill unread (autofillRead false), and a
    // submit on an unread form asks credential - the stricter class, still never an allow.
    assert.deepEqual([unread.autofillRead, unread.autofilledFields], [false, null])
    assert.equal(judge({ type: 'keypress', keys: ['ENTER'] }, unread), 'credential', 'a Return after a failed read asks (credential outranks submit)')
    assert.equal(judge({ type: 'keypress', keys: ['ENTER'] }, { ...unread, autofillRead: true, autofilledFields: undefined }), 'submit', 'with the autofill read, the failed default-button read alone asks submit')
    world.resolveFails = false
    // A text drop: inspectPoint's inner target (it carries frameHost too) is the drop target (#184 round 2).
    const hit = AX[FRAME][5]
    AX[FRAME][5] = { role: 'textbox', name: '' }
    const dropTarget = await env.inspectPoint({ x: 240, y: 120 })
    AX[FRAME][5] = hit
    assert.deepEqual([dropTarget.name, dropTarget.frameHost.name], ['', 'Secure Credit Card Frame - CVV'])
    const drag = { type: 'drag', path: [{ x: 10, y: 10 }, { x: 240, y: 120 }] }
    const source = { tag: 'p', role: 'paragraph', name: 'Your code', origin: 'https://shop.example' }
    const dropped = policy.classify(drag, { url: 'https://shop.example/checkout', target: source, dropTarget: { ...dropTarget, autocomplete: null }, dragText: '123' })
    assert.equal(dropped.decision === 'allow' ? 'allow' : dropped.class, 'sensitive_data', 'a text drop into the framed CVV asks too')
    AX[PAGE][40] = { role: 'Iframe', name: 'Comments' }
    AX[FRAME][9] = { role: 'textbox', name: 'Order notes' }
    assert.equal(judge({ type: 'type', text: 'gift wrap' }, await env.focusedElement()), 'allow', 'two neutral names stay free (the twin)')
    await env.close()
  } finally {
    AX[FRAME][9] = saved
    AX[PAGE][40] = savedHost
  }
})

test('CU-300: describeElement gives frameUrl inside a frame only - origin and path, no query, fragment or credentials; the scheme alone otherwise', () => {
  const top = { name: 'top' }
  const inFrame = (location) => ({ tagName: 'INPUT', type: 'text', getAttribute: () => null, parentElement: null, childNodes: [], ownerDocument: { defaultView: { top, location } } })
  const http = { protocol: 'https:', host: 'pay.example:8443', pathname: '/elements/inner', origin: 'https://pay.example:8443', search: '?token=abc', hash: '#x' }
  assert.equal(describeElement(inFrame(http)).frameUrl, 'https://pay.example:8443/elements/inner')
  assert.equal(describeElement(inFrame({ protocol: 'data:', host: '', pathname: 'text/html,<input name=cvv>', origin: 'null' })).frameUrl, 'data:', 'no payload')
  assert.equal(describeElement(inFrame({ protocol: 'about:', host: '', pathname: 'srcdoc', origin: 'https://shop.example' })).frameUrl, 'about:')
  const view = { location: http }
  view.top = view
  const onTop = describeElement({ tagName: 'INPUT', type: 'text', getAttribute: () => null, parentElement: null, childNodes: [], ownerDocument: { defaultView: view } })
  assert.equal('frameUrl' in onTop, false, 'absent on the top document')
  const isolated = new Function(`return (${describeElement.toString()})`)()
  assert.deepEqual(isolated(inFrame(http)), describeElement(inFrame(http)), 'self-contained, as the driver runs it in the page')
})

test('CU-300 x CU-319: a focus followed into a cross-site frame carries the autofilled fields of the frame\'s form, read in its own world', async () => {
  const world = { frameFocus: focusOn(5), frameAutofill: [9] }
  const { options, attach } = harness(world)
  const saved = AX[FRAME][9]
  try {
    AX[FRAME][9] = { role: 'textbox', name: 'Password' }
    const env = await launchBrowserEnvironment(options)
    await attach(env)
    const focused = await env.focusedElement()
    assert.equal(focused.frameHost.name, 'Secure CVC input frame', 'still the followed inner entry')
    assert.deepEqual([focused.autofillRead, focused.autofilledFields.map((field) => field.name)], [true, ['Password']])
    world.frameAutofill = null
    assert.equal('autofillRead' in (await env.focusedElement()), false, 'no submit-like answer from the frame: nothing added')
    await env.close()
  } finally {
    AX[FRAME][9] = saved
  }
})

test('CU-336: a host whose AX read fails is named from the words the page gives the iframe - the page script first, the attribute list when the node does not resolve, null when it carries none', async () => {
  const world = { frameFocus: focusOn(5), hostAxFails: true, hostLabel: 'Card security code' }
  const { options, attach } = harness(world)
  const savedAttributes = HOST.attributes
  try {
    const env = await launchBrowserEnvironment(options)
    await attach(env)
    assert.deepEqual((await env.focusedElement()).frameHost, { tag: 'iframe', role: null, name: 'Card security code' }, 'aria-labelledby text (or aria-label, title) read in the page')
    world.pageResolveFails = true
    assert.equal((await env.focusedElement()).frameHost.name, 'Secure CVC input frame', 'the node does not resolve: the title from its describeNode attributes')
    assert.equal((await env.inspectPoint({ x: 240, y: 120 })).frameHost.name, 'Secure CVC input frame', 'inspectPoint through the frame alike')
    HOST.attributes = []
    assert.equal((await env.focusedElement()).frameHost.name, null, 'no words at all: still unread, for the policy\'s own rules')
    HOST.attributes = ['name', '__privateStripeFrame5', 'src', 'https://js.stripe.example/v3/elements-inner-cvc.html']
    const stripeInner = await env.focusedElement()
    assert.equal(stripeInner.frameHost.name, null, 'a name attribute is an id for scripts, never a label: the frame stays unnamed (cu-researcher)')
    // End to end with CU-336's policy half (PR #274), cu-researcher's row: the frame host the driver reports (unnamed, as
    // the id is no label) around an inner field whose own names are unread asks for a short code; with a name attribute
    // taken as the frame's name it would have been allowed.
    const policy = createPolicy({ sitePolicy: () => 'allow' })
    const judge = (target) => { const v = policy.classify({ type: 'type', text: '123' }, { url: 'https://shop.example/checkout', target }); return v.decision === 'allow' ? 'allow' : v.class }
    const unnamedInner = { ...stripeInner, name: null, autocomplete: null }
    assert.equal(judge(unnamedInner), 'sensitive_data', "'123' into the id-only frame's unnamed field asks sensitive_data")
    assert.equal(judge({ ...unnamedInner, frameHost: { ...stripeInner.frameHost, name: '__privateStripeFrame5' } }), 'allow', 'the mutant reading: the id as the frame name lets it through - why the driver never takes it')
    assert.equal(judge(stripeInner), 'credential', 'the harness field itself (CVC, cc-csc) asks by its own names, as before')
    HOST.attributes = savedAttributes
    world.pageResolveFails = false
    world.hostLabel = null
    assert.equal((await env.focusedElement()).frameHost.name, null, 'the page script found none: null, not a guess')
    world.hostAxFails = false
    assert.equal((await env.focusedElement()).frameHost.name, 'Secure CVC input frame', 'a read AX name is kept as before')
    await env.close()
  } finally {
    HOST.attributes = savedAttributes
  }
})

test('CU-336: the iframe itself as the target (the focus not followed) takes the same fallback when its AX read fails', async () => {
  const world = { frameFocus: focusOn(5), hostAxFails: true, hostLabel: 'Secure Credit Card Frame - CVV' }
  const { options } = harness(world)
  const env = await launchBrowserEnvironment(options)
  const host = await env.focusedElement()
  assert.deepEqual([host.tag, host.name, host.frameHost], ['iframe', 'Secure Credit Card Frame - CVV', undefined], 'no frame session: the iframe element, named from the page')
  world.pageResolveFails = true
  assert.equal((await env.focusedElement()).name, 'Secure CVC input frame', 'from its attributes when it does not resolve')
  await env.close()
})

test("CU-336 end to end: a CVV frame whose AX name is unread still asks once the driver reads its title (the red-team's unread case)", async () => {
  const policy = createPolicy({ sitePolicy: () => 'allow' })
  const judge = (action, target) => {
    const verdict = policy.classify(action, { url: 'https://shop.example/checkout', target })
    return verdict.decision === 'allow' ? 'allow' : verdict.class
  }
  const world = { frameFocus: focusOn(9), hostAxFails: true, pageResolveFails: true }
  const { options, attach } = harness(world)
  const savedAttributes = HOST.attributes
  try {
    HOST.attributes = ['title', 'Secure Credit Card Frame - CVV']
    const env = await launchBrowserEnvironment(options)
    await attach(env)
    world.submit = false
    const cvv = await env.focusedElement()
    assert.deepEqual([cvv.name, cvv.frameHost.name], ['', 'Secure Credit Card Frame - CVV'])
    assert.equal(judge({ type: 'type', text: '123' }, cvv), 'sensitive_data', 'typed into the unnamed inner field: the host title asks')
    await env.close()
  } finally {
    HOST.attributes = savedAttributes
  }
})

test('CU-336: frameLabel takes aria-labelledby text, then aria-label, then title - never the name attribute; collapsed, at most 80 characters, self-contained; the attribute form skips labelledby', () => {
  const doc = { getElementById: (id) => ({ a: { textContent: '  Card  ' }, b: { textContent: 'security code' } })[id] ?? null }
  const el = (attrs) => ({ nodeType: 1, ownerDocument: doc, getAttribute: (name) => attrs[name] ?? null })
  assert.equal(frameLabel(el({ 'aria-labelledby': 'a b missing', 'aria-label': 'x', title: 'y' })), 'Card security code')
  assert.equal(frameLabel(el({ 'aria-label': '  Secure   CVC ', title: 'y' })), 'Secure CVC')
  assert.equal(frameLabel(el({ title: 'Secure Credit Card Frame - CVV', name: 'n' })), 'Secure Credit Card Frame - CVV')
  assert.equal(frameLabel(el({ name: '__privateStripeFrame5' })), null, 'an id is no label')
  assert.equal(frameLabel(el({ 'aria-labelledby': 'missing' })), null)
  assert.equal(frameLabel(el({ title: 'x'.repeat(200) })).length, 80)
  assert.equal(frameLabel(null), null)
  const isolated = new Function(`return (${frameLabel.toString()})`)()
  assert.equal(isolated(el({ title: 'T' })), 'T', 'runs serialized in the page')
  assert.equal(frameLabelFromAttributes(['aria-labelledby', 'a', 'title', ' T ', 'name', 'n']), 'T')
  assert.equal(frameLabelFromAttributes(['src', 'https://pay.example/']), null)
  assert.equal(frameLabelFromAttributes(['name', 'frame1']), null, 'never the name attribute')
})
