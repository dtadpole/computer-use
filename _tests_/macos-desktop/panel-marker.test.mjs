import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

/**
 * The helper's two CU-39 signals as the driver carries them (D-045). `panel: 'save'|'open'` marks an element inside
 * AppKit's own panel - in-process for a non-sandboxed app, so no hostedBy - and the driver passes it to agent core,
 * which asks file_choice. `elementOwner` names the process that owns the element when it is not the window's owner
 * (a remote panel); the driver refuses that point unless the owner is approved or the helper attributed it (hostedBy).
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const PANEL = 'com.apple.appkit.xpc.openAndSavePanelService'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })

const SAVE = { role: 'AXButton', subrole: null, title: 'Save', frame: { x: 200, y: 200, width: 80, height: 30 }, secure: false }
const world = (element) => ({
  displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
  apps: [{ bundleId: FIXTURE, pid: 601, title: 'Save', rect: { x: 0, y: 0, width: 600, height: 600 } }],
  frontmost: FIXTURE,
  elements: [{ rect: SAVE.frame, element: { bundleId: FIXTURE, pid: 601, ...element } }],
  focused: { bundleId: FIXTURE, pid: 601, ...element },
})
const code = (expected) => (error) => error instanceof EnvironmentError && error.code === expected

async function launched(config) {
  const started = await launchOnFake(config)
  await logged(started.child, 3)
  return started
}

test('panel: save/open/unknown carried to agent core (other values fail closed to unknown), joined to the fingerprint, not refused by the driver', async () => {
  const marked = await launched(world({ ...SAVE, panel: 'save' }))
  try {
    const hit = await marked.env.inspectPoint({ x: 220, y: 210 })
    assert.deepEqual([hit.origin, hit.role, hit.name, hit.panel, hit.hostedBy, hit.elementOwner], [FIXTURE, 'AXButton', 'Save', 'save', null, null])
    assert.equal((await marked.env.focusedElement()).panel, 'save')
    await marked.env.perform({ type: 'click', x: 220, y: 210, button: 'left' })
    assert.equal(marked.child.requests.filter((r) => r.type === 'input').length, 1, 'the driver posts it; agent core asks file_choice first')
    const plain = await launched(world(SAVE))
    let same = null
    try {
      same = await plain.env.inspectPoint({ x: 220, y: 210 })
      assert.equal(same.panel, null, 'absent: not a panel')
      assert.notEqual(same.fingerprint, hit.fingerprint, 'a Save in a panel is another target than one elsewhere')
    } finally {
      await plain.env.close()
      await stopFake(plain.child)
    }
    // 'unknown' (the walk hit its limit) is carried, and any other value fails closed to it: never 'not a panel'.
    for (const [sent, carried] of [['unknown', 'unknown'], ['print', 'unknown'], [7, 'unknown']]) {
      const odd = await launched(world({ ...SAVE, panel: sent }))
      try {
        const got = await odd.env.inspectPoint({ x: 220, y: 210 })
        assert.equal(got.panel, carried, String(sent))
        assert.notEqual(got.fingerprint, same.fingerprint)
      } finally {
        await odd.env.close()
        await stopFake(odd.child)
      }
    }
  } finally {
    await marked.env.close()
    await stopFake(marked.child)
  }
})

test('elementOwner: an element owned by an unapproved process is refused unposted, naming it; approved or attributed passes (D-045)', async () => {
  const ownerOnly = { role: null, subrole: null, title: null, frame: null, secure: false, elementOwner: { bundleId: PANEL, pid: 777 } }
  const foreign = await launched(world(ownerOnly))
  try {
    assert.equal((await foreign.env.inspectPoint({ x: 220, y: 210 })).elementOwner, PANEL, 'agent core sees whose element it is')
    await assert.rejects(foreign.env.perform({ type: 'click', x: 220, y: 210, button: 'left' }),
      (e) => code('out_of_scope')(e) && e.details?.reason === 'target_out_of_scope' && e.details.bundleId === PANEL)
    assert.equal(foreign.child.requests.filter((r) => r.type === 'input').length, 0, 'nothing posted')
  } finally {
    await foreign.env.close()
    await stopFake(foreign.child)
  }
  for (const element of [{ ...ownerOnly, hostedBy: PANEL }, { ...ownerOnly, elementOwner: { bundleId: FIXTURE, pid: 601 } }]) {
    const ok = await launched(world(element))
    try {
      await ok.env.perform({ type: 'click', x: 220, y: 210, button: 'left' })
      assert.equal(ok.child.requests.filter((r) => r.type === 'input').length, 1, JSON.stringify(element.hostedBy ?? element.elementOwner))
    } finally {
      await ok.env.close()
      await stopFake(ok.child)
    }
  }
})

test('an element no bundle id names is refused as target_unverified, naming the culprit: the reply\'s own pid and its executable, with elementOwner as sent', async () => {
  // A transient bundle-less window over CU Fixture's element: the top-level pid is that window's owner (here this test's
  // own process, so ps can name it), while elementOwner names CU Fixture - which must not be taken for the culprit.
  const window = { bundleId: null, pid: process.pid, role: null, subrole: null, title: null, frame: null, secure: false, elementOwner: { bundleId: FIXTURE, pid: 601 } }
  const { env, child } = await launched(world(window))
  try {
    await assert.rejects(env.perform({ type: 'click', x: 220, y: 210, button: 'left' }),
      (e) => code('out_of_scope')(e) && e.details?.reason === 'target_unverified' && e.details.ownerPid === process.pid
        && typeof e.details.ownerExecutable === 'string' && /node/i.test(e.details.ownerExecutable)
        && JSON.stringify(e.details.elementOwner) === JSON.stringify({ pid: 601, bundleId: FIXTURE }))
    assert.equal(child.requests.filter((r) => r.type === 'input').length, 0, 'nothing posted')
  } finally {
    await env.close()
    await stopFake(child)
  }
  // No elementOwner, an unreadable pid: still refused, the fields null.
  const bare = await launched(world({ bundleId: null, pid: 999999, role: null, subrole: null, title: null, frame: null, secure: false }))
  try {
    await assert.rejects(bare.env.perform({ type: 'click', x: 220, y: 210, button: 'left' }),
      (e) => e.details?.reason === 'target_unverified' && e.details.ownerPid === 999999 && e.details.ownerExecutable === null && e.details.elementOwner === null)
  } finally {
    await bare.env.close()
    await stopFake(bare.child)
  }
})
