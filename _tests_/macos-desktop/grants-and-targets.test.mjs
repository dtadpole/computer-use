import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, test } from 'node:test'

import { createRunControl } from '../../_tools_/agent-core/lib.mjs'
import { createAppPolicy } from '../../_tools_/agent-core/app-policy.mjs'
import { OPAQUE_ROLES } from '../../_environments_/macos-desktop/environment.mjs'
import { ERROR_CODES, EnvironmentError, GRANT_NAMES } from '../../_environments_/macos-desktop/errors.mjs'
import { helloProblem, PROTOCOL_VERSION, replyError, SECURE_INPUT_REFUSAL } from '../../_environments_/macos-desktop/helper-link.mjs'
import { fakeLauncher, scratchLocks, stdioLink, stopFake } from './harness.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Design 0.3 on the driver side: the `secure_input` code (input-and-targets.md, R83), the `postEvents` grant in hello
 * (helper-and-protocol.md), and targets with `opaque` and a fingerprint over bundle id, role, title and frame - each
 * checked against the fake helper and, where agent core decides by it, against agent core's app policy.
 */

const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected
const FIXTURE = 'com.example.fixture'
const OTHER = 'com.example.other'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks)
const click = (x = 5, y = 5) => ({ type: 'click', x, y, button: 'left' })

test('secure_input: a key step under secure input is a secure_input hand-off, and state() says so until a person hands back', async () => {
  assert.equal(ERROR_CODES.includes('secure_input'), true)
  const control = createRunControl({ runId: 'secure' })
  const { env, child } = await launchOnFake({ quirks: { secureInput: true } }, { control })
  try {
    await env.perform(click())
    assert.equal(env.state().secureInput, false, 'pointer input has no key step to refuse')
    await assert.rejects(env.perform({ type: 'keypress', keys: ['ENTER'] }), (e) => code('secure_input')(e) && e.message === SECURE_INPUT_REFUSAL && e.details.reason === 'secure_input')
    assert.equal(env.state().secureInput, true)
    await assert.rejects(env.perform({ type: 'type', text: 'hunter2' }), code('secure_input'))
    await assert.rejects(env.perform({ type: 'click', x: 5, y: 5, keys: ['SHIFT'] }), code('secure_input'), 'a held modifier is a key step too')
    await env.perform(click())
    assert.equal(env.state().secureInput, true, 'a pointer action does not clear it')
    assert.equal(env.lostReason, null, 'a refusal, not a broken helper')
    // Agent core's app policy reads state().secureInput and hands key actions to the person, never a confirm.
    const policy = createAppPolicy({ scope: [FIXTURE] })
    const state = env.state()
    const decision = policy.classify({ type: 'keypress', keys: ['ENTER'] }, { frontmostBundleId: state.frontmostBundleId, secureInput: state.secureInput, target: null })
    assert.deepEqual([decision.decision, decision.rule], ['handoff', 'secure_field'])
    control.send({ command: 'take_over' }, { source: 'control' })
    control.send({ command: 'hand_back' }, { source: 'control' })
    assert.equal(env.state().secureInput, false, 'the hand-off is over; the helper checks the next key step afresh')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('secure_input mid-action: done false with failedAt maps to the same code, partial; a key step that posts clears the mark', async () => {
  const { child, link } = await stdioLink({ quirks: { secureInput: true } })
  try {
    await link.request('scope', { bundleIds: [FIXTURE] })
    await link.request('pauseOnLocalInput', { on: true })
    const events = [{ kind: 'move', x: 1, y: 1, flags: 0 }, { kind: 'keyDown', keyCode: 36, flags: 0 }, { kind: 'keyUp', keyCode: 36, flags: 0 }]
    const reply = await link.request('input', { events, mode: 'global', bundleId: FIXTURE })
    assert.deepEqual([reply.done, reply.failedAt, reply.code], [false, 1, 'secure_input'], 'the pointer step posted, the key step did not')
    assert.equal(typeof reply.message, 'string', 'the mid-batch form carries a message, as the Swift helper\'s does')
    const mapped = replyError('input', reply)
    assert.deepEqual([mapped.code, mapped.message, mapped.details], ['secure_input', SECURE_INPUT_REFUSAL, { reason: 'secure_input', failedAt: 1 }])
    // Helper 0.2.2 uses only the mid-batch form, also when nothing was posted: failedAt 0.
    const first = await link.request('input', { events: [{ kind: 'text', text: 'x' }], mode: 'global', bundleId: FIXTURE })
    assert.deepEqual([first.done, first.failedAt, first.code, first.frontmostBundleId], [false, 0, 'secure_input', FIXTURE])
    assert.equal(link.lost, false)
  } finally {
    link.close()
    await stopFake(child)
  }
  // The older refusal form, behind a quirk, is still a refusal on the link.
  const older = await stdioLink({ quirks: { secureInput: true, secureInputRefusal: true } })
  try {
    await older.link.request('scope', { bundleIds: [FIXTURE] })
    await older.link.request('pauseOnLocalInput', { on: true })
    await assert.rejects(older.link.request('input', { events: [{ kind: 'text', text: 'x' }], mode: 'global', bundleId: FIXTURE }), (e) => code('secure_input')(e) && e.details.failedAt === null)
  } finally {
    older.link.close()
    await stopFake(older.child)
  }
  // The driver takes both forms to the same hand-off: nothing posted, partial false, the secure mark set.
  for (const quirks of [{ secureInput: true }, { secureInput: true, secureInputRefusal: true }]) {
    const run = await launchOnFake({ quirks })
    try {
      await assert.rejects(run.env.perform({ type: 'type', text: 'hunter2' }), (e) => code('secure_input')(e) && e.message === SECURE_INPUT_REFUSAL && e.details.partial !== true, JSON.stringify(quirks))
      assert.equal(run.env.state().secureInput, true)
    } finally {
      await run.env.close()
      await stopFake(run.child)
    }
  }
  const { env, child: fake } = await launchOnFake()
  try {
    const original = env.link.request.bind(env.link)
    env.link.request = async (type, fields, options) => (type === 'input' ? { done: false, failedAt: 2, code: 'secure_input', frontmostBundleId: FIXTURE } : original(type, fields, options))
    await assert.rejects(env.perform({ type: 'keypress', keys: ['META', 'A'] }), (e) => code('secure_input')(e) && e.details.failedAt === 2 && e.details.partial === true)
    assert.equal(env.state().secureInput, true)
    env.link.request = original
    await env.perform({ type: 'keypress', keys: ['ENTER'] })
    assert.equal(env.state().secureInput, false, 'the helper checked secure input was off before the key it posted')
  } finally {
    await env.close()
    await stopFake(fake)
  }
})

test('grants: hello reports postEvents, shown in grants and state(); without it input is not_granted naming it', async () => {
  const plain = await launchOnFake()
  try {
    assert.deepEqual(plain.env.grants, { screen: true, accessibility: true, postEvents: true, listenEvents: false })
    assert.deepEqual(plain.env.state().grants, plain.env.grants)
    assert.equal(Object.isFrozen(plain.env.grants), true)
  } finally {
    await plain.env.close()
    await stopFake(plain.child)
  }
  assert.equal(GRANT_NAMES.postEvents, 'Accessibility (posting events)')
  const noPost = await launchOnFake({ grants: { postEvents: false } })
  try {
    assert.equal(noPost.env.state().grants.postEvents, false)
    await assert.rejects(noPost.env.perform(click()), (e) => code('not_granted')(e) && e.details.grant === 'postEvents' && e.message.includes('Accessibility (posting events)'))
    await assert.rejects(noPost.env.simulateLocalInput({ via: 'untagged' }), (e) => code('not_granted')(e) && e.details.grant === 'postEvents', 'an untagged event is posted too')
    assert.equal(await noPost.env.inspectPoint({ x: 1, y: 1 }), null, 'hit tests need Accessibility only')
    await noPost.env.screenshot()
  } finally {
    await noPost.env.close()
    await stopFake(noPost.child)
  }
  // A helper from before design 0.3 does not report postEvents: unknown, never read as granted.
  const older = await launchOnFake({ grants: { postEvents: null } })
  try {
    assert.equal(older.env.grants.postEvents, null)
    await older.env.perform(click())
  } finally {
    await older.env.close()
    await stopFake(older.child)
  }
})

test('hello: postEvents and listenEvents are booleans when present, and an unknown grant is refused by name', () => {
  const hello = (grants) => ({
    type: 'hello', token: 't', protocol: PROTOCOL_VERSION, helperVersion: '0.3.0', grants,
    displays: [{ id: 1, originPt: { x: 0, y: 0 }, sizePt: { width: 10, height: 10 }, scale: 1 }],
  })
  assert.equal(helloProblem(hello({ screen: true, accessibility: true, postEvents: false, listenEvents: true }), 't'), null)
  assert.equal(helloProblem(hello({ screen: true, accessibility: true }), 't'), null, 'the optional grants may be absent')
  assert.match(helloProblem(hello({ screen: true, accessibility: true, postEvents: 'yes' }), 't'), /postEvents must be boolean/)
  assert.match(helloProblem(hello({ screen: true, accessibility: true, listenEvents: 1 }), 't'), /listenEvents must be boolean/)
  assert.match(helloProblem(hello({ screen: true, accessibility: true, camera: true }), 't'), /no grant 'camera'/)
})

/** The fingerprint formula of input-and-targets.md, pinned so the helper side and the trajectory can rely on it. */
const fingerprintOf = ({ bundleId, role, title, frame }) => createHash('sha256').update([bundleId ?? '', role ?? '', title ?? '', frame.x, frame.y, frame.width, frame.height].join('|')).digest('hex').slice(0, 32)

/** One element per 100-point cell of the fixture's half of the screen, a twin in the other app, and an outside app. */
function targetWorld() {
  const cell = (col, row) => ({ x: col * 100, y: row * 100, width: 100, height: 100 })
  const element = (col, row, fields, bundleId = FIXTURE) => ({ rect: cell(col, row), element: { bundleId, pid: bundleId === FIXTURE ? 501 : 502, subrole: null, secure: false, frame: { ...cell(col, row), width: 90, height: 20 }, ...fields } })
  return {
    apps: [
      { bundleId: FIXTURE, pid: 501, rect: { x: 0, y: 0, width: 400, height: 600 } },
      { bundleId: OTHER, pid: 502, rect: { x: 400, y: 0, width: 300, height: 600 } },
      { bundleId: 'com.example.outside', pid: 503, rect: { x: 700, y: 0, width: 100, height: 600 } },
    ],
    elements: [
      element(0, 0, { role: 'AXButton', title: 'OK', frame: { x: 10, y: 10, width: 50, height: 20 } }),
      element(4, 0, { role: 'AXButton', title: 'OK', frame: { x: 10, y: 10, width: 50, height: 20 } }, OTHER),
      element(0, 1, { role: 'AXGroup', title: null }),
      element(1, 1, { role: 'AXGroup', title: 'Toolbar' }),
      element(2, 1, { role: 'AXButton', title: '' }),
      element(3, 1, { role: 'AXScrollArea', title: '   ' }),
      element(0, 2, { role: 'AXImage', title: 'Canvas', opaque: true }),
      element(1, 2, { role: 'AXGroup', title: null, opaque: false }),
      element(2, 2, { role: 'AXWindow', title: null }),
      element(3, 2, { role: 'AXUnknown' }),
      element(0, 3, { role: 'AXMenuItem', title: 'Paste' }),
      element(7, 0, { role: 'AXButton', title: 'Secret' }, 'com.example.outside'),
    ],
  }
}

test('targets: the fingerprint covers bundle id, role, title and frame, so twins in two apps differ; opaque comes from the helper', async () => {
  assert.deepEqual(OPAQUE_ROLES, ['AXUnknown', 'AXGroup', 'AXWindow', 'AXScrollArea'])
  const { env, child } = await launchOnFake(targetWorld(), { apps: [FIXTURE, OTHER] })
  try {
    const ok = await env.inspectPoint({ x: 50, y: 50 })
    const twin = await env.inspectPoint({ x: 450, y: 50 })
    assert.deepEqual([ok.role, ok.name, twin.role, twin.name], ['AXButton', 'OK', 'AXButton', 'OK'])
    assert.notEqual(ok.fingerprint, twin.fingerprint, 'same role, title and frame in two apps are two targets')
    assert.equal(ok.fingerprint, fingerprintOf({ bundleId: FIXTURE, role: 'AXButton', title: 'OK', frame: { x: 10, y: 10, width: 50, height: 20 } }))
    assert.equal((await env.inspectPoint({ x: 50, y: 50 })).fingerprint, ok.fingerprint, 'stable')
    const opaque = async (x, y) => (await env.inspectPoint({ x, y })).opaque
    assert.deepEqual(
      [await opaque(50, 50), await opaque(50, 150), await opaque(150, 150), await opaque(250, 150), await opaque(350, 150), await opaque(50, 250), await opaque(150, 250), await opaque(250, 250), await opaque(350, 250)],
      [false, true, false, false, true, true, false, true, true],
      'named or specific roles are not opaque; unnamed generic ones are; the helper\'s own opaque is taken as given',
    )
    const outside = await env.inspectPoint({ x: 750, y: 50 })
    assert.deepEqual([outside.origin, outside.name, outside.role, outside.opaque], ['com.example.outside', null, null, false], 'outside the scope: bundle id only')
    assert.equal(outside.fingerprint, fingerprintOf({ bundleId: 'com.example.outside', role: null, title: null, frame: { x: '', y: '', width: '', height: '' } }))
    // Agent core's app policy: an opaque target is an unknown_target confirm. Copy, cut and paste - a Command chord or
    // the Paste menu item - are allowed since D-031; the check accepts either agent core, the one after PR #489
    // (allow) and the one before it (blocked by C9's 'clipboard' rule), but one agent core answers all of them alike.
    // The start app is approved 'always' as a person would, so the check reaches the target classes both before and
    // after P11 (start apps ask new_app unless the always store covers them).
    const approvals = createAppApprovals({ path: join(mkdtempSync(join(tmpdir(), 'cu-approvals-')), 'app-approvals.json') })
    approvals.grantAlways(FIXTURE, { by: 'api' })
    const policy = createAppPolicy({ scope: [FIXTURE, OTHER], approvals })
    const context = async (x, y) => ({ frontmostBundleId: FIXTURE, target: await env.inspectPoint({ x, y }) })
    assert.deepEqual((({ decision, class: kind }) => [decision, kind])(policy.classify(click(50, 150), await context(50, 150))), ['confirm', 'unknown_target'])
    assert.equal(policy.classify(click(50, 50), await context(50, 50)).decision, 'allow')
    const clipboard = [
      ['the Paste menu item', policy.classify(click(50, 350), await context(50, 350))],
      ['META+C', policy.classify({ type: 'keypress', keys: ['META', 'C'] }, { frontmostBundleId: FIXTURE, target: null })],
      ['META+V', policy.classify({ type: 'keypress', keys: ['META', 'V'] }, { frontmostBundleId: FIXTURE, target: null })],
    ].map(([label, { decision, rule }]) => [label, decision === 'allow' ? ['allow'] : [decision, rule]])
    for (const [label, answer] of clipboard) {
      assert.ok(['allow', 'block,clipboard'].includes(answer.join()), `${label}: allowed (D-031) or C9's clipboard block, got ${answer.join(' ')}`)
    }
    assert.equal(new Set(clipboard.map(([, answer]) => answer.join())).size, 1, 'one agent core answers every clipboard action alike')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('targets from a helper before design 0.3, which sends no opaque: the driver derives it by the same rule', async () => {
  const { env, child } = await launchOnFake({ ...targetWorld(), quirks: { omitOpaque: true } }, { apps: [FIXTURE, OTHER] })
  try {
    const opaque = async (x, y) => (await env.inspectPoint({ x, y })).opaque
    assert.deepEqual(
      [await opaque(50, 50), await opaque(50, 150), await opaque(150, 150), await opaque(250, 150), await opaque(350, 150), await opaque(250, 250), await opaque(350, 250)],
      [false, true, false, false, true, true, true],
    )
    assert.equal(await opaque(50, 250), false, 'without the helper\'s word, a named element is not opaque')
    assert.equal((await env.focusedElement()), null)
  } finally {
    await env.close()
    await stopFake(child)
  }
})
