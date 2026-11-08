import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// CU-90's nested-scroll item 'invoice-page', offscreen: the list starts below the fold, so neither it nor its rows are
// targets until the page scrolls; rows are targets only while wholly shown in both views; each settled scroll records
// {view, offset} once; open records the row.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 350))

async function withPage(params, body) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('invoice-page', { title: 'Northwind', ...params })
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

const rows = (targets) => Object.keys(targets).filter((name) => name.startsWith('row-')).sort()

describe('invoice-page (CU-90)', () => {
  test('at open: the page is a target, the list below the fold and its rows are not; 40 invoices', async () => {
    await withPage({}, async (fixture) => {
      const targets = await fixture.targets()
      assert.ok(targets.page, 'the page is not a target')
      assert.equal(targets.list, undefined, 'the list is a target below the fold')
      assert.deepEqual(rows(targets), [])
      const { fields } = await fixture.state()
      assert.deepEqual([fields.pageOffset, fields.listOffset, fields.count], [0, 0, 40])
    })
  })

  test('scrolling the page to the list shows it and its wholly shown rows; then the list scrolls on its own', async () => {
    await withPage({}, async (fixture) => {
      await fixture.act({ scrollTo: { view: 'page', offset: 450 } })
      await settle()
      let targets = await fixture.targets()
      assert.ok(targets.list, 'the list is not a target once the page shows it')
      const first = rows(targets)
      assert.ok(first.includes('row-inv-01') && first.length >= 5 && first.length <= 10, `rows shown: ${first}`)
      await fixture.act({ scrollTo: { view: 'list', offset: 400 } })
      await settle()
      targets = await fixture.targets()
      const second = rows(targets)
      assert.ok(second.includes('row-inv-21') && !second.includes('row-inv-01'), `rows after the list scrolled: ${second}`)
      const { events, fields } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'scrolled').map((e) => [e.view, e.offset]), [['page', 450], ['list', 400]])
      assert.deepEqual([fields.pageOffset, fields.listOffset], [450, 400])
    })
  })

  test('a row half under the page edge is not a target', async () => {
    await withPage({}, async (fixture) => {
      // The list starts at 590 in the page; a 420-high window at offset 240 shows down to 660 - the header and part of
      // the first rows, so whichever row the edge cuts is out.
      await fixture.act({ scrollTo: { view: 'page', offset: 240 } })
      await settle()
      const targets = await fixture.targets()
      for (const name of rows(targets)) {
        const t = targets[name]
        assert.ok(t.y + t.height <= 420 + 0.5, `${name} reaches below the window: ${JSON.stringify(t)}`)
      }
    })
  })

  test('each seam scroll records at once and the settle adds nothing; open records the row', async () => {
    await withPage({}, async (fixture) => {
      await fixture.act({ scrollTo: { view: 'page', offset: 100 } })
      await fixture.act({ scrollTo: { view: 'page', offset: 470 } })
      await fixture.act({ scrollTo: { view: 'page', offset: 470 } })
      await settle()
      await fixture.act({ open: { item: 'inv-07' } })
      const { events } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'scrolled').map((e) => [e.view, e.offset]), [['page', 100], ['page', 470]])
      assert.deepEqual(events.filter((e) => e.type === 'opened').map((e) => e.item), ['inv-07'])
    })
  })
})
