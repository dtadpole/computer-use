import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// 'web-buttons' (CU-180, the desktop twin of CU-175/CU-176), offscreen: web content in a native window with four
// controls named only by what is inside them. The page measures their rects once loaded; the targets 'web:<id>' are
// where a live click aims (the helper's hit test returns the label or icon inside, and must report the control). A
// click records 'web-click' and nothing else.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

const IDS = ['delete-span', 'delete-icon', 'buy-link', 'delete-div']
const TARGETS = [...IDS, 'plain-text', 'plain-delete'] // plain paragraph spans: no control, nothing to lift them to

// A deadline, not a count: the offscreen WKWebView's first load can take well over 5 s on a loaded Mac (cu-integrator's
// gate, 11-12 Nov: timeouts at load 14-22 on PRs that never touch the page), so the page load gets PAGE_LOAD_MS, as the
// other fixture waits do, and each later step STEP_MS. Polls every 50 ms either way.
const PAGE_LOAD_MS = 20_000
const STEP_MS = 5_000

async function until(fixture, check, label, budgetMs = STEP_MS) {
  const deadline = Date.now() + budgetMs
  for (;;) {
    const state = await fixture.state()
    if (check(state)) return state
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label} (${budgetMs} ms)`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

async function withPage(body) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('web-buttons', { title: 'Project files' })
    await until(fixture, (state) => state.fields.webLoaded === true, 'the page to load', PAGE_LOAD_MS)
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

describe('web-buttons (CU-180)', () => {
  test('the four controls and the plain span are targets in the window, each inside the web view', async () => {
    await withPage(async (fixture) => {
      const targets = await fixture.targets()
      for (const id of TARGETS) {
        const target = targets[`web:${id}`]
        assert.ok(target, `web:${id} is a target`)
        assert.equal(target.window, 'main')
        assert.ok(target.width > 0 && target.height > 0, `web:${id} has a size`)
        assert.ok(target.x >= 20 && target.y >= 56, `web:${id} lies inside the web view`)
      }
      const ys = TARGETS.map((id) => targets[`web:${id}`].cy)
      assert.deepEqual([...ys].sort((a, b) => a - b), ys, 'one control per row, top to bottom')
    })
  })

  test('a click records web-click with the control, and nothing before it', async () => {
    await withPage(async (fixture) => {
      assert.deepEqual((await fixture.state()).fields.webClicks, [])
      for (const id of IDS) await fixture.act({ webClick: id })
      await assert.rejects(fixture.act({ webClick: 'plain-text' }), /./, 'the plain span is no control: the seam refuses it')
      await assert.rejects(fixture.act({ webClick: 'plain-delete' }), /./, 'nor the paragraph that mentions delete')
      const state = await until(fixture, (s) => s.fields.webClicks.length === IDS.length, 'four clicks')
      assert.deepEqual(state.fields.webClicks, IDS)
      assert.deepEqual(state.events.filter((e) => e.type === 'web-click').map((e) => e.id), IDS)
    })
  })
})
