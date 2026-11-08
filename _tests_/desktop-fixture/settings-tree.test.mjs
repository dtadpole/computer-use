import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// CU-66 S4 'settings-tree', offscreen: only the visible place's controls are targets; Advanced hides two settings
// until opened; params.target puts a key under Advanced at its 'from' value; a change records 'setting' once; Save
// records what changed since the last save.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

async function withTree(params, body) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('settings-tree', { title: 'Settings', ...params })
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

describe('settings-tree (CU-66 S4)', () => {
  test('at open: the three sections, Network\'s two tabs, General\'s four settings, Advanced closed; nothing else', async () => {
    await withTree({}, async (fixture) => {
      const targets = await fixture.targets()
      for (const name of ['section-Network', 'section-Privacy', 'section-Display', 'tab-General', 'tab-Proxies', 'advanced', 'save', 'wifi', 'ipv6', 'metered', 'hostname']) assert.ok(targets[name], name)
      for (const name of ['mtu', 'dns-over-https', 'tab-History', 'cookies']) assert.equal(targets[name], undefined, name)
      const { fields } = await fixture.state()
      assert.deepEqual([fields.section, fields.tab, fields.advancedOpen], ['Network', 'General', false])
    })
  })

  test('navigating by the controls: Privacy, then Cookies, then Advanced shows that tab\'s two hidden settings', async () => {
    await withTree({}, async (fixture) => {
      await fixture.act({ press: 'section-Privacy' })
      await fixture.act({ press: 'tab-Cookies' })
      let targets = await fixture.targets()
      assert.ok(targets.cookies && !targets['cookie-lifetime'] && !targets.wifi)
      await fixture.act({ press: 'advanced' })
      targets = await fixture.targets()
      assert.ok(targets['cookie-lifetime'] && targets.partitioning)
      const { fields } = await fixture.state()
      assert.deepEqual([fields.section, fields.tab, fields.advancedOpen], ['Privacy', 'Cookies', true])
    })
  })

  test('params.target puts the key under Advanced on its tab at its from value; a change records once; Save lists it', async () => {
    await withTree({ target: { section: 'Display', tab: 'Colour', key: 'night-shift', from: 'Custom' } }, async (fixture) => {
      await fixture.act({ place: { section: 'Display', tab: 'Colour', advanced: true } })
      let { fields } = await fixture.state()
      assert.equal(fields.values['night-shift'], 'Custom')
      await fixture.act({ select: 'night-shift', value: 'Off' })
      await fixture.act({ select: 'night-shift', value: 'Off' })
      await fixture.act({ press: 'save' })
      const { events } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'setting').map((e) => [e.key, e.value]), [['night-shift', 'Off']])
      assert.deepEqual(events.filter((e) => e.type === 'saved').map((e) => e.changed), [{ 'night-shift': 'Off' }])
    })
  })

  test('a target key the tab lacks takes the last Advanced slot with its label and options', async () => {
    await withTree({ target: { section: 'Network', tab: 'Proxies', key: 'proxy-dns', label: 'Proxy DNS', from: 'Local', options: ['Local', 'Remote'] } }, async (fixture) => {
      await fixture.act({ place: { section: 'Network', tab: 'Proxies', advanced: true } })
      const targets = await fixture.targets()
      assert.ok(targets['proxy-dns'] && targets['proxy-auth'] && !targets['proxy-timeout'])
      const { fields } = await fixture.state()
      assert.equal(fields.values['proxy-dns'], 'Local')
    })
  })

  test('switching tab closes Advanced; Save with nothing changed records an empty change list', async () => {
    await withTree({}, async (fixture) => {
      await fixture.act({ press: 'advanced' })
      await fixture.act({ press: 'tab-Proxies' })
      const { fields } = await fixture.state()
      assert.equal(fields.advancedOpen, false)
      await fixture.act({ press: 'save' })
      const { events } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'saved').map((e) => e.changed), [{}])
    })
  })
})
