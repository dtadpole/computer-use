import assert from 'node:assert/strict'
import { before, describe, test } from 'node:test'

import { buildFixtureApp } from '../../_tools_/desktop-fixture/build.mjs'
import { launchFixture } from '../../_tools_/desktop-fixture/client.mjs'

// S6 file-browser (CU-66, CU-64), offscreen: rows and folders as targets, selection facts in list order, moves and
// copies through the seams, and that a move takes rows out of the list while a copy keeps them.

let executable
before(() => {
  executable = buildFixtureApp().executable
})

async function withFiles(params, body) {
  const fixture = await launchFixture(executable, { offscreen: true })
  try {
    await fixture.open('file-browser', { title: 'Files', ...params })
    return await body(fixture)
  } finally {
    await fixture.close()
  }
}

const doc = (n) => `doc-${String(n).padStart(3, '0')}.txt`
const rows = (targets) => Object.keys(targets).filter((name) => name.startsWith('file-'))

describe('S6 file-browser (CU-66)', () => {
  test('opens with 300 numbered files, the wholly shown rows as targets, and four folders', async () => {
    await withFiles({}, async (fixture) => {
      const targets = await fixture.targets()
      const shown = rows(targets)
      assert.ok(targets[`file-${doc(1)}`] && !targets[`file-${doc(300)}`], `${shown.length} rows shown`)
      assert.ok(shown.length >= 18 && shown.length <= 22, `${shown.length} rows shown`)
      for (const name of ['Archive', 'Q3', 'Drafts', 'Shared']) assert.ok(targets[`folder-${name}`], `no folder-${name}`)
      const first = targets[`file-${doc(1)}`]
      assert.equal(first.height, 20)
      assert.ok(first.width >= 400, 'a row target spans the row')
      const { fields } = await fixture.state()
      assert.equal(fields.fileCount, 300)
      assert.deepEqual(fields.selection, [])
    })
  })

  test('select records the selection in list order; copy keeps the files, move takes them out; facts name files and folder', async () => {
    await withFiles({}, async (fixture) => {
      const range = Array.from({ length: 16 }, (_, i) => doc(40 + i))
      await fixture.act({ select: [...range].reverse() })
      await fixture.act({ drop: { folder: 'Q3', copy: true } })
      const set = [doc(3), doc(17), doc(99), doc(150), doc(201)]
      await fixture.act({ select: set })
      await fixture.act({ drop: { folder: 'Archive', copy: false } })
      const { fields, events } = await fixture.state()
      const selected = events.filter((e) => e.type === 'selected').map((e) => e.files)
      assert.deepEqual(selected[0], range, 'selection is in list order')
      assert.deepEqual(events.filter((e) => e.type === 'copied').map((e) => [e.folder, e.files]), [['Q3', range]])
      assert.deepEqual(events.filter((e) => e.type === 'moved').map((e) => [e.folder, e.files]), [['Archive', set]])
      assert.deepEqual(fields['folder-Q3'], range)
      assert.deepEqual(fields['folder-Archive'], set)
      assert.equal(fields.fileCount, 295, 'a move takes the files out of the list; a copy keeps them')
      const targets = await fixture.targets()
      assert.ok(!targets[`file-${doc(3)}`] && !targets[`file-${doc(17)}`], 'a moved file still names a row')
      assert.ok(targets[`file-${doc(1)}`] && targets[`file-${doc(2)}`])
    })
  })

  test('scrollTo brings a far file into view; rows that leave the screen stop being targets', async () => {
    await withFiles({}, async (fixture) => {
      await fixture.act({ scrollTo: doc(250) })
      const targets = await fixture.targets()
      assert.ok(targets[`file-${doc(250)}`], 'doc-250 is not on screen')
      assert.ok(!targets[`file-${doc(1)}`], 'doc-001 still names a target')
    })
  })

  test('files and folders come from the params; a drop with nothing selected records nothing', async () => {
    await withFiles({ files: [{ name: 'a.pdf', size: '1 KB' }, 'b.pdf', 'c.pdf'], folders: ['Inbox', 'Done'] }, async (fixture) => {
      const targets = await fixture.targets()
      assert.deepEqual(rows(targets).sort(), ['file-a.pdf', 'file-b.pdf', 'file-c.pdf'])
      assert.ok(targets['folder-Inbox'] && targets['folder-Done'] && !targets['folder-Archive'])
      await fixture.act({ drop: { folder: 'Done', copy: false } })
      const { events } = await fixture.state()
      assert.equal(events.filter((e) => e.type === 'moved' || e.type === 'copied').length, 0)
    })
  })
})
