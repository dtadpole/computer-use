import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { after, describe, test } from 'node:test'

import { APP_NAME, EXECUTABLE, LEDGER, buildFixtureApp, bundleComplete, discardIncomplete, placeBuild } from '../../_tools_/desktop-fixture/build.mjs'

// CU-653: a cached fixture app counts only when it is whole. The 21 Nov ~08:00Z host tmp cleanup took Info.plist from
// every cached fixture app and left the executables; the cache still counted them as built, and the desktop-fixture
// verifier failed 'two apps with stable identities' on main. The twin of the helper cache check (#1153). The rows
// inject `verify` and `compile` where they need no bundle; one row checks real seals on a copy of the shared build.

const bases = []
const scratch = () => {
  const base = mkdtempSync('/tmp/cu-fixture-cache-')
  bases.push(base)
  return base
}
after(() => {
  for (const base of bases) rmSync(base, { recursive: true, force: true })
})

/** One app bundle on disk with the given parts; no real code. */
function fakeApp(app, { plist = true } = {}) {
  mkdirSync(join(app, 'Contents', 'MacOS'), { recursive: true })
  writeFileSync(join(app, 'Contents', 'MacOS', EXECUTABLE), 'exe')
  if (plist) writeFileSync(join(app, 'Contents', 'Info.plist'), '<plist/>')
  return { app, executable: join(app, 'Contents', 'MacOS', EXECUTABLE) }
}

/** A stand-in compile: both apps, whole, in the staging folder; counts its calls. */
function fakeCompile() {
  const calls = []
  const compile = (staging) => {
    calls.push(staging)
    fakeApp(join(staging, `${APP_NAME}.app`))
    fakeApp(join(staging, `${LEDGER.name}.app`))
  }
  return { compile, calls }
}

const refusal = () => Object.assign(new Error('codesign: a sealed resource is missing or invalid'), { status: 1 })
const accept = () => {}

/** A cache root under a scratch cacheRoot, laid out as buildFixtureApp names it, from one whole compile. */
function cachedRoot() {
  const cacheRoot = scratch()
  const first = fakeCompile()
  const built = buildFixtureApp({ cacheRoot, verify: accept, compile: first.compile })
  assert.equal(built.cached, false)
  return { cacheRoot, built, root: dirname(built.app) }
}

describe('bundleComplete (CU-653)', () => {
  test('executable, Info.plist and a seal that verifies: whole', () => {
    const { app, executable } = fakeApp(join(scratch(), 'A.app'))
    let verified
    assert.equal(bundleComplete(app, executable, { verify: (bundle) => { verified = bundle } }), true)
    assert.equal(verified, app, 'the seal of the bundle itself is checked')
  })

  test('Info.plist gone (the 21 Nov cleanup): not whole, whatever the executable says', () => {
    const { app, executable } = fakeApp(join(scratch(), 'A.app'), { plist: false })
    assert.equal(bundleComplete(app, executable, { verify: accept }), false)
  })

  test('codesign refuses the seal (exit status 1): not whole', () => {
    const { app, executable } = fakeApp(join(scratch(), 'A.app'))
    assert.equal(bundleComplete(app, executable, { verify: () => { throw refusal() } }), false)
  })

  test('codesign cannot run or times out under load (no exit status): says nothing, so the cache stands', () => {
    const { app, executable } = fakeApp(join(scratch(), 'A.app'))
    const timedOut = () => { throw Object.assign(new Error('spawnSync /usr/bin/codesign ETIMEDOUT'), { code: 'ETIMEDOUT', status: null }) }
    assert.equal(bundleComplete(app, executable, { verify: timedOut }), true)
  })

  test('real seals on a copy of the shared build: intact verifies; a stripped signature or a changed executable does not', () => {
    // The shared cache, built once per source hash (every file of this suite builds it); copied, never touched.
    const shared = buildFixtureApp()
    const copy = join(scratch(), basename(shared.ledger.app))
    execFileSync('/usr/bin/ditto', [shared.ledger.app, copy])
    const executable = join(copy, 'Contents', 'MacOS', EXECUTABLE)
    assert.equal(bundleComplete(copy, executable), true, 'an intact copy verifies')
    const unsealed = join(scratch(), basename(shared.ledger.app))
    execFileSync('/usr/bin/ditto', [shared.ledger.app, unsealed])
    rmSync(join(unsealed, 'Contents', '_CodeSignature'), { recursive: true, force: true })
    assert.equal(bundleComplete(unsealed, join(unsealed, 'Contents', 'MacOS', EXECUTABLE)), false, 'codesign refuses a bundle without its seal')
    appendFileSync(executable, 'x')
    assert.equal(bundleComplete(copy, executable), false, 'codesign refuses a changed executable')
  })
})

describe('buildFixtureApp on a half cache (CU-653)', () => {
  test('a whole cache is reused: no compile', () => {
    const { cacheRoot } = cachedRoot()
    const again = fakeCompile()
    assert.equal(buildFixtureApp({ cacheRoot, verify: accept, compile: again.compile }).cached, true)
    assert.equal(again.calls.length, 0)
  })

  for (const app of [APP_NAME, LEDGER.name]) {
    test(`${app} without its Info.plist (the 21 Nov cleanup): rebuilt whole, then reused`, () => {
      const { cacheRoot, root } = cachedRoot()
      rmSync(join(root, `${app}.app`, 'Contents', 'Info.plist'))
      const rebuild = fakeCompile()
      const built = buildFixtureApp({ cacheRoot, verify: accept, compile: rebuild.compile })
      assert.equal(built.cached, false, 'a half cache does not count as built')
      assert.equal(rebuild.calls.length, 1)
      assert.equal(existsSync(join(root, `${app}.app`, 'Contents', 'Info.plist')), true, `${app} has its Info.plist again`)
      assert.deepEqual(readdirSync(cacheRoot), [basename(root)], 'no staging or broken root is left beside it')
      assert.equal(buildFixtureApp({ cacheRoot, verify: accept, compile: fakeCompile().compile }).cached, true)
    })

    test(`${app} with a seal codesign refuses: rebuilt`, () => {
      const { cacheRoot, root } = cachedRoot()
      const broken = join(root, `${app}.app`)
      let refused = true
      const verify = (bundle) => { if (bundle === broken && refused) throw refusal() }
      const rebuild = { calls: [], compile: (staging) => { refused = false; fakeCompile().compile(staging); rebuild.calls.push(staging) } }
      assert.equal(buildFixtureApp({ cacheRoot, verify, compile: rebuild.compile }).cached, false)
      assert.equal(rebuild.calls.length, 1)
    })
  }

  test('only one of the two apps in the cache: rebuilt with both', () => {
    const { cacheRoot, root } = cachedRoot()
    rmSync(join(root, `${LEDGER.name}.app`), { recursive: true, force: true })
    const rebuild = fakeCompile()
    const built = buildFixtureApp({ cacheRoot, verify: accept, compile: rebuild.compile })
    assert.equal(built.cached, false)
    assert.equal(existsSync(built.ledger.executable), true)
  })
})

describe('discardIncomplete (CU-653)', () => {
  test('an incomplete root is set aside and removed, so a build can be renamed into place', () => {
    const base = scratch()
    const root = join(base, 'root')
    fakeApp(join(root, 'A.app'), { plist: false })
    assert.equal(discardIncomplete(root, () => false), true)
    assert.equal(existsSync(root), false)
    assert.deepEqual(readdirSync(base), [], 'nothing is left aside')
  })

  test('a root that is whole is kept', () => {
    const root = join(scratch(), 'root')
    fakeApp(join(root, 'A.app'))
    assert.equal(discardIncomplete(root, () => true), false)
    assert.equal(existsSync(join(root, 'A.app', 'Contents', 'Info.plist')), true)
  })

  test('no root, or one another process removed first (ENOENT): nothing to do, no throw', () => {
    const root = join(scratch(), 'root')
    assert.equal(discardIncomplete(root, () => false), false)
    fakeApp(join(root, 'A.app'), { plist: false })
    const gone = () => { throw Object.assign(new Error('ENOENT: no such file or directory, rename'), { code: 'ENOENT' }) }
    assert.equal(discardIncomplete(root, () => false, { rename: gone }), false)
  })
})

test('placeBuild with the whole-bundle check: a root of stripped plists is no winner, the rename error stands', () => {
  const base = scratch()
  const root = join(base, 'root'), staging = join(base, 'root.staging-1')
  const { executable } = fakeApp(join(root, 'A.app'), { plist: false })
  fakeApp(join(staging, 'A.app'))
  assert.throws(() => placeBuild(staging, root, [executable], { complete: () => bundleComplete(join(root, 'A.app'), executable, { verify: accept }) }), /ENOTEMPTY|EEXIST/)
})
