import assert from 'node:assert/strict'
import { after, test } from 'node:test'

import { linkSchemeOf } from '../../_environments_/macos-desktop/environment.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { fakeLauncher, logged, scratchLocks, stopFake } from './harness.mjs'

/**
 * CU-265's desktop half: a link in an approved app (an AXLink whose AXURL is facetime:, tel:, zoommtg: or mailto:) starts
 * another app, so its target carries the scheme - only the scheme, never the URL - for agent core to ask about. Links
 * only: a file browser's items carry file: URLs too, and launch_code judges those (CU-255). On the fake helper.
 */

const FIXTURE = 'ai.reflection.cu.fixture'
const locks = scratchLocks()
after(() => locks.remove())
const launchOnFake = fakeLauncher(locks, { apps: [FIXTURE] })
const at = (y) => ({ x: 100, y, width: 200, height: 20 })
const LINK = { bundleId: FIXTURE, pid: 601, role: 'AXLink', subrole: null, title: 'Call support', frame: at(100), secure: false, url: 'facetime://+15550100' }
const MAIL = { ...LINK, title: 'Write to us', frame: at(200), url: 'mailto:someone@example.com?subject=x' }
const WEB = { ...LINK, title: 'Docs', frame: at(300), url: 'https://example.com/docs' }
const FILE = { ...LINK, role: 'AXImage', title: 'Payload', frame: at(400), url: 'file:///Applications/Payload.app/' }
const BARE = { ...LINK, title: 'Odd link', frame: at(500), url: undefined }

test('CU-265 driver: an AXLink carries its scheme only; a non-link with a file URL and a link without a URL carry none', async () => {
  const control = createRunControl()
  const elements = [LINK, MAIL, WEB, FILE, BARE].map((element) => ({ rect: element.frame, element }))
  const { env, child } = await launchOnFake({
    displays: [{ id: 1, main: true, originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }],
    apps: [{ bundleId: FIXTURE, pid: 601, title: 'Fixture', rect: { x: 0, y: 0, width: 800, height: 600 } }],
    frontmost: FIXTURE,
    elements,
  }, { control })
  await logged(child, 3)
  try {
    await env.addApp(FIXTURE)
    const scheme = async (y) => (await env.inspectPoint({ x: 150, y: y + 10 })).linkScheme
    assert.equal(await scheme(100), 'facetime')
    assert.equal(await scheme(200), 'mailto', 'the scheme only, never the address')
    assert.equal(await scheme(300), 'https')
    assert.equal(await scheme(400), null, 'a file item is no link: launch_code judges it')
    assert.equal(await scheme(500), null, 'a link without a URL')
    const target = await env.inspectPoint({ x: 150, y: 110 })
    assert.equal(JSON.stringify(target).includes('15550100'), false, 'the number never reaches the target')
  } finally {
    await env.close()
    await stopFake(child)
  }
})

test('CU-265 driver: linkSchemeOf keeps a lower-case scheme and nothing else', () => {
  assert.equal(linkSchemeOf('TEL:+15550100'), 'tel')
  assert.equal(linkSchemeOf(' zoommtg://zoom.us/join?confno=1 '), 'zoommtg')
  for (const bad of [undefined, null, '', '   ', 'not a url', '/relative/path', 7]) assert.equal(linkSchemeOf(bad), null, JSON.stringify(bad))
})
