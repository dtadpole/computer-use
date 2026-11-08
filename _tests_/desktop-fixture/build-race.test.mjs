import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'

import { placeBuild } from '../../_tools_/desktop-fixture/build.mjs'

// CU-141: two builds of one source hash race; the loser's rename onto the winner's complete bundle must not fail the
// run - it drops its own staging build and uses the identical winner. Pinned without compiling: the race is staged.

function bundle(dir, text) {
  for (const app of ['A.app', 'B.app']) {
    mkdirSync(join(dir, app, 'Contents', 'MacOS'), { recursive: true })
    writeFileSync(join(dir, app, 'Contents', 'MacOS', 'exe'), text)
  }
  return [join(dir, 'A.app', 'Contents', 'MacOS', 'exe'), join(dir, 'B.app', 'Contents', 'MacOS', 'exe')]
}

describe('placeBuild (CU-141)', () => {
  test('a complete winner already in place: no throw, our staging removed, the winner untouched', () => {
    const base = mkdtempSync('/tmp/cu-fixture-race-')
    const root = join(base, 'root'), staging = join(base, 'root.staging-1')
    const executables = bundle(root, 'winner')
    bundle(staging, 'loser')
    placeBuild(staging, root, executables)
    assert.equal(existsSync(staging), false)
    assert.equal(readFileSync(executables[0], 'utf8'), 'winner')
  })

  test('the winner lands between our check and our rename: ENOTEMPTY is absorbed when its bundle is complete', () => {
    const base = mkdtempSync('/tmp/cu-fixture-race-')
    const root = join(base, 'root'), staging = join(base, 'root.staging-2')
    bundle(staging, 'loser')
    const executables = [join(root, 'A.app', 'Contents', 'MacOS', 'exe'), join(root, 'B.app', 'Contents', 'MacOS', 'exe')]
    // The other build finishes just before our rename, which then fails as macOS fails it: ENOTEMPTY.
    const rename = (from, to) => { bundle(root, 'winner'); renameSync(from, to) }
    placeBuild(staging, root, executables, { rename })
    assert.equal(existsSync(staging), false)
    assert.equal(readFileSync(executables[0], 'utf8'), 'winner')
  })

  test('an incomplete root is no winner: the rename error stands', () => {
    const base = mkdtempSync('/tmp/cu-fixture-race-')
    const root = join(base, 'root'), staging = join(base, 'root.staging-3')
    mkdirSync(join(root, 'leftover'), { recursive: true })
    bundle(staging, 'loser')
    assert.throws(() => placeBuild(staging, root, [join(root, 'A.app', 'Contents', 'MacOS', 'exe')]), /ENOTEMPTY|EEXIST/)
  })

  test('a winner with CU Fixture but without CU Ledger is not complete: the rename error stands', () => {
    const base = mkdtempSync('/tmp/cu-fixture-race-')
    const root = join(base, 'root'), staging = join(base, 'root.staging-5')
    const [fixtureExe, ledgerExe] = bundle(root, 'half')
    rmSync(join(root, 'B.app'), { recursive: true, force: true })
    bundle(staging, 'loser')
    assert.throws(() => placeBuild(staging, root, [fixtureExe, ledgerExe]), /ENOTEMPTY|EEXIST/)
  })

  test('nothing in place: our build is renamed into place', () => {
    const base = mkdtempSync('/tmp/cu-fixture-race-')
    const root = join(base, 'root'), staging = join(base, 'root.staging-4')
    bundle(staging, 'ours')
    placeBuild(staging, root, [join(root, 'A.app', 'Contents', 'MacOS', 'exe'), join(root, 'B.app', 'Contents', 'MacOS', 'exe')])
    assert.equal(readFileSync(join(root, 'A.app', 'Contents', 'MacOS', 'exe'), 'utf8'), 'ours')
    assert.equal(existsSync(staging), false)
  })
})
