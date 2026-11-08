import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// S1 grid-sheet (CU-66, CU-63), offscreen: the visible cells as targets, scrolling both ways, the model-backed facts,
// the commit path with Return and Tab, and add-row.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

const NOTE = Array.from({ length: 12 }, (_, i) => `City${i + 1},${10 + i},c${i + 1}`).join('\n')

async function withGrid(params, body) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('grid-sheet', { title: 'Sheet', note: NOTE, ...params })
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

const cells = (targets) => Object.keys(targets).filter((name) => name.startsWith('cell-'))

describe('S1 grid-sheet (CU-66)', () => {
  test('opens at A1 with the wholly shown cells (6 columns x 17 rows of 72 x 20 pt) as targets, plus add-row and the note', async () => {
    await withGrid({}, async (fixture) => {
      const targets = await fixture.targets()
      const shown = cells(targets)
      // Whole cells only: 6 columns x 17 rows are wholly shown (the 7th column and 18th row are cut by the scroll bars).
      assert.ok(targets['cell-A1'] && targets['cell-F17'] && !targets['cell-G1'] && !targets['cell-A18'], `visible cells: ${shown.length}`)
      assert.ok(!targets['cell-Q237'] && !targets['cell-Z1'] && !targets['cell-A40'], 'far cells are not on screen')
      assert.deepEqual([targets['cell-A1'].width, targets['cell-A1'].height], [72, 20])
      assert.equal(targets['cell-B1'].x - targets['cell-A1'].x, 72)
      assert.equal(targets['cell-A2'].y - targets['cell-A1'].y, 20)
      assert.equal(shown.length, 6 * 17, `${shown.length} cells on screen`)
      assert.ok(targets['add-row'] && targets.note)
      // Only whole cells: none reaches below the grid or under 'Add row' (cu-researcher's no-overlap check with #182).
      const add = targets['add-row']
      for (const name of shown) assert.ok(targets[name].y + targets[name].height <= add.y, `${name} reaches 'Add row'`)
    })
  })

  test('scrollTo brings a far cell into view both ways; the old cells stop being targets', async () => {
    await withGrid({}, async (fixture) => {
      await fixture.act({ scrollTo: { row: 237, col: 'Q' } })
      const targets = await fixture.targets()
      assert.ok(targets['cell-Q237'], 'Q237 is not on screen after scrollTo')
      assert.ok(!targets['cell-A1'], 'A1 still names a target after scrolling away')
      const t = targets['cell-Q237']
      assert.ok(t.x >= 52 && t.x + t.width <= 572 && t.y >= 12 && t.y + t.height <= 416, JSON.stringify(t))
    })
  })

  test('seeded cells are facts from the start; setCell records edited once, and an unchanged value records nothing', async () => {
    await withGrid({ seed: { B3: 'Apples', c4: 'Pears' } }, async (fixture) => {
      let { fields, events } = await fixture.state()
      assert.equal(fields.B3, 'Apples')
      assert.equal(fields.C4, 'Pears')
      assert.equal(fields['cell-A1'], undefined, 'visible empty cells are not facts')
      await fixture.act({ setCell: { cell: 'Q237', value: '42' } })
      await fixture.act({ setCell: { cell: 'Q237', value: '42' } })
      ;({ fields, events } = await fixture.state())
      assert.equal(fields.Q237, '42')
      assert.deepEqual(events.filter((e) => e.type === 'edited').map((e) => [e.cell, e.value]), [['Q237', '42']])
    })
  })

  test('the commit path: a visible cell committed with Return records edited and the value survives scrolling away and back', async () => {
    await withGrid({}, async (fixture) => {
      await fixture.act({ commitCell: { cell: 'A1', text: 'City1', movement: 'return' } })
      await fixture.act({ commitCell: { cell: 'B1', text: '10', movement: 'tab' } })
      await fixture.act({ scrollTo: { row: 200, col: 'M' } })
      await fixture.act({ scrollTo: { row: 1, col: 'A' } })
      const { fields, events } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'edited').map((e) => [e.cell, e.value]), [['A1', 'City1'], ['B1', '10']])
      assert.deepEqual([fields.A1, fields.B1], ['City1', '10'])
      const targets = await fixture.targets()
      assert.ok(targets['cell-A1'])
    })
  })

  test('add-row appends row 301, 302, ...; the new rows scroll into view and take values', async () => {
    await withGrid({}, async (fixture) => {
      await fixture.act({ press: 'add-row' })
      await fixture.act({ press: 'add-row' })
      await fixture.act({ scrollTo: { row: 302, col: 'A' } })
      const targets = await fixture.targets()
      assert.ok(targets['cell-A301'] && targets['cell-A302'], 'the added rows are not on screen')
      await fixture.act({ setCell: { cell: 'A301', value: 'City1' } })
      const { fields, events } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'row-added').map((e) => e.row), [301, 302])
      assert.equal(fields.A301, 'City1')
      await assert.doesNotReject(fixture.act({ scrollTo: { row: 302, col: 'Z' } }))
    })
  })

  test('the note shows its 12 lines; no cell value or expected answer sits anywhere else in the window', async () => {
    await withGrid({}, async (fixture) => {
      const { fields } = await fixture.state()
      assert.deepEqual(Object.keys(fields).filter((k) => /^[A-Z]\d+$/.test(k)), [], 'an empty sheet reports no cells')
    })
  })
})

// chain-rows (cu-researcher): with codeSeed, column D shows chainCode(A, B, codeSeed) once both are committed; it takes
// no value and records nothing. Without codeSeed, D is an ordinary cell.
function chainCode(a, b, seed) {
  let hash = 2166136261
  for (const byte of Buffer.from(`${a}|${b}|${seed}`, 'utf8')) hash = Math.imul(hash ^ byte, 16777619) >>> 0
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return [0, 1, 2, 3].map((i) => alphabet[(hash >>> (5 * i)) & 31]).join('')
}

describe('grid-sheet computed column D (chain-rows)', () => {
  test('the test vector: START, 1, s1 -> WM4N (tasks.mjs chainCode)', () => {
    assert.equal(chainCode('START', '1', 's1'), 'WM4N')
  })

  test('D shows the code once A and B are committed, takes no value, records nothing, and is not a fact', async () => {
    await withGrid({ codeSeed: 's1' }, async (fixture) => {
      const shown = async (cell) => (await fixture.call('gridShown', { cell })).text
      await fixture.act({ setCell: { cell: 'A1', value: 'START' } })
      assert.equal(await shown('D1'), '', 'D shows before B is committed')
      await fixture.act({ setCell: { cell: 'B1', value: '1' } })
      assert.equal(await shown('D1'), 'WM4N')
      await fixture.act({ setCell: { cell: 'D1', value: 'XXXX' } })
      assert.equal(await shown('D1'), 'WM4N', 'D took a value')
      // D takes no typing at all (cu-verifier): its field is not editable, while A and B are.
      const editable = async (cell) => (await fixture.call('gridShown', { cell })).editable
      assert.deepEqual([await editable('D1'), await editable('A1'), await editable('B1'), await editable('E1')], [false, true, true, true])
      await fixture.act({ commitCell: { cell: 'D1', text: 'ZZZZ', movement: 'return' } })
      assert.equal((await fixture.state()).events.filter((e) => e.type === 'edited' && e.cell === 'D1').length, 0, 'a commit into D recorded a fact')
      await fixture.act({ press: 'add-row' })
      await fixture.act({ scrollTo: { row: 301, col: 'A' } })
      await fixture.act({ setCell: { cell: 'A301', value: 'WM4N' } })
      await fixture.act({ setCell: { cell: 'B301', value: '2' } })
      assert.equal(await shown('D301'), chainCode('WM4N', '2', 's1'))
      const { fields, events } = await fixture.state()
      assert.deepEqual(events.filter((e) => e.type === 'edited').map((e) => e.cell), ['A1', 'B1', 'A301', 'B301'])
      assert.equal(fields.D1, undefined)
    })
  })

  test('without codeSeed, D is an ordinary cell', async () => {
    await withGrid({}, async (fixture) => {
      await fixture.act({ setCell: { cell: 'D1', value: 'mine' } })
      const { fields } = await fixture.state()
      assert.equal(fields.D1, 'mine')
      assert.equal((await fixture.call('gridShown', { cell: 'D1' })).editable, true)
    })
  })
})

// CU-90: a settled scroll records 'scrolled' {topRow, leftCol} once; quick successive scrolls record where it settled.
describe('grid-sheet scrolled facts (CU-90)', () => {
  const settle = () => new Promise((resolve) => setTimeout(resolve, 350))
  test('scrolling down, right and far records the top row and left column once each - at once through the seam, never again at the settle', async () => {
    await withGrid({}, async (fixture) => {
      await fixture.act({ scrollTo: { row: 120, col: 'A' } })
      await settle()
      await fixture.act({ scrollTo: { row: 120, col: 'M' } })
      await settle()
      await fixture.act({ scrollTo: { row: 250, col: 'M' } })
      // The oracle's seam records at once: the state read right after it sees the fact (cu-researcher's play()).
      const immediate = (await fixture.state()).events.filter((e) => e.type === 'scrolled')
      await settle()
      const facts = (await fixture.state()).events.filter((e) => e.type === 'scrolled')
      assert.equal(immediate.length, 3, JSON.stringify(immediate))
      assert.equal(facts.length, 3, `the settle recorded again: ${JSON.stringify(facts)}`)
      const [down, right, far] = facts
      assert.ok(down.topRow > 100 && down.topRow <= 120 && down.leftCol === 'A', JSON.stringify(down))
      assert.ok(right.topRow === down.topRow && right.leftCol > 'A' && right.leftCol <= 'M', JSON.stringify(right))
      assert.ok(far.topRow > 230 && far.topRow <= 250, JSON.stringify(far))
    })
  })
})
