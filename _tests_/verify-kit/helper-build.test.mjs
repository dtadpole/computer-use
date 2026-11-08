import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, test } from 'node:test'

import { buildCUHelper, isStaleSkeleton, SKELETON_AGE_MS } from '../../_tools_/verify-kit/helper-build.mjs'

/**
 * CU-216: an aborted CUHelper build must not poison its source hash. Each test builds a stand-in helper tree whose
 * build.sh keeps the real script's guard (it refuses a CUHelper.app without Info.plist at its output) and writes a
 * shell-script "executable" that answers --version, into a cache root of its own - never the real /tmp cache.
 */

const scratch = []
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true })
})
const tempDir = (label) => {
  const dir = mkdtempSync(join(tmpdir(), `cu-helper-build-test-${label}-`))
  scratch.push(dir)
  return dir
}

const LATER = Date.now() + SKELETON_AGE_MS + 60_000

/**
 * A stand-in SUT whose build.sh fails its first `failFirst` runs after leaving the folders the real script makes
 * first, and with `landFirst` lands a complete build at the cache path before its own (another run won the race).
 * Returns `{ root, builds() }`; builds() counts build.sh runs (the counter sits outside the hashed files).
 */
function standInSut({ failFirst = 0, landFirst = false } = {}) {
  const root = tempDir('sut')
  const helper = join(root, '_environments_/macos-desktop/helper')
  mkdirSync(join(helper, 'Sources'), { recursive: true })
  writeFileSync(join(helper, 'Sources', 'Main.swift'), '// stand-in\n')
  const writeApp = `write_app() {
  mkdir -p "$1/Contents/MacOS" "$1/Contents/Resources"
  printf '#!/bin/sh\\necho "CUHelper 0.2.99"\\n' > "$1/Contents/MacOS/CUHelper"
  chmod +x "$1/Contents/MacOS/CUHelper"
  echo '<string>com.reflection.cu-helper</string>' > "$1/Contents/Info.plist"
}`
  writeFileSync(join(helper, 'build.sh'), `set -eu
here="$(cd "$(dirname "$0")" && pwd)"
app="$1/CUHelper.app"
${writeApp}
n=$(( $(cat "$here/count" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$here/count"
if [ -e "$app" ] && [ ! -f "$app/Contents/Info.plist" ]; then echo "build.sh: $app exists and is not a CUHelper build; refusing to replace it" >&2; exit 1; fi
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
if [ "$n" -le ${failFirst} ]; then echo "build.sh: stopped (local input)" >&2; exit 1; fi
${landFirst ? 'case "$1" in *.stage-*) write_app "${1%.stage-*}/CUHelper.app" ;; esac' : ':'}
write_app "$app"
`)
  return { root, builds: () => Number(readFileSync(join(helper, 'count'), 'utf8')) }
}

const cacheEntries = (cache) => readdirSync(cache).sort()
const skeletonAt = (app) => {
  mkdirSync(join(app, 'Contents', 'MacOS'), { recursive: true })
  mkdirSync(join(app, 'Contents', 'Resources'), { recursive: true })
}

describe('buildCUHelper', () => {
  test('builds once per source hash, into the cache path, leaving no staging folder', () => {
    const sut = standInSut()
    const cache = tempDir('cache')
    const first = buildCUHelper(sut.root, { cacheRoot: cache })
    assert.deepEqual(first.version, [0, 2, 99])
    assert.match(first.executable, /\/cu-verifier-cuhelper-[0-9a-f]{16}\/CUHelper\.app\/Contents\/MacOS\/CUHelper$/)
    assert.equal(dirname(dirname(dirname(dirname(first.executable)))).startsWith(cache), true)
    const second = buildCUHelper(sut.root, { cacheRoot: cache })
    assert.equal(second.executable, first.executable)
    assert.equal(sut.builds(), 1)
    assert.deepEqual(cacheEntries(cache).filter((name) => name.includes('.stage-')), [])
  })

  test('an aborted build leaves nothing at the cache path, so the next run of the same source builds (CU-216)', () => {
    const sut = standInSut({ failFirst: 1 })
    const cache = tempDir('cache')
    const aborted = buildCUHelper(sut.root, { cacheRoot: cache })
    assert.equal(aborted.executable, null)
    assert.match(aborted.why, /did not build: .*stopped \(local input\)/)
    const [out, ...rest] = cacheEntries(cache)
    assert.deepEqual(rest, [], 'no staging folder is left behind')
    assert.equal(existsSync(join(cache, out, 'CUHelper.app')), false, 'no skeleton at the cache path')
    const next = buildCUHelper(sut.root, { cacheRoot: cache })
    assert.equal(next.executable, join(cache, out, 'CUHelper.app', 'Contents', 'MacOS', 'CUHelper'))
    assert.deepEqual(next.version, [0, 2, 99])
  })

  test('a stale empty skeleton an older build left at the cache path is removed and replaced', () => {
    const sut = standInSut()
    const cache = tempDir('cache')
    const app = dirname(dirname(dirname(buildCUHelper(sut.root, { cacheRoot: cache }).executable)))
    rmSync(app, { recursive: true })
    skeletonAt(app)
    const rebuilt = buildCUHelper(sut.root, { cacheRoot: cache, now: LATER })
    assert.equal(rebuilt.executable, join(app, 'Contents', 'MacOS', 'CUHelper'))
    assert.equal(existsSync(rebuilt.executable), true)
    assert.equal(sut.builds(), 2)
  })

  test('a young skeleton may be a build still running: left alone, and this run uses its staged build', () => {
    const sut = standInSut()
    const cache = tempDir('cache')
    const app = dirname(dirname(dirname(buildCUHelper(sut.root, { cacheRoot: cache }).executable)))
    rmSync(app, { recursive: true })
    skeletonAt(app)
    const staged = buildCUHelper(sut.root, { cacheRoot: cache })
    assert.match(staged.executable, /\.stage-[^/]+\/CUHelper\.app\/Contents\/MacOS\/CUHelper$/)
    assert.deepEqual(staged.version, [0, 2, 99])
    assert.deepEqual(readdirSync(join(app, 'Contents')).sort(), ['MacOS', 'Resources'], 'the skeleton is untouched')
    assert.deepEqual(readdirSync(join(app, 'Contents', 'MacOS')), [])
  })

  test('a cache path holding any file is never removed, however old', () => {
    const sut = standInSut()
    const cache = tempDir('cache')
    const app = dirname(dirname(dirname(buildCUHelper(sut.root, { cacheRoot: cache }).executable)))
    rmSync(app, { recursive: true })
    skeletonAt(app)
    writeFileSync(join(app, 'Contents', 'Resources', 'kept.txt'), 'not ours to delete\n')
    const staged = buildCUHelper(sut.root, { cacheRoot: cache, now: LATER })
    assert.match(staged.executable, /\.stage-/)
    assert.equal(readFileSync(join(app, 'Contents', 'Resources', 'kept.txt'), 'utf8'), 'not ours to delete\n')
  })

  test('when another run of the same source lands first, its build is used and the staging folder removed', () => {
    const sut = standInSut({ landFirst: true })
    const cache = tempDir('cache')
    const built = buildCUHelper(sut.root, { cacheRoot: cache })
    assert.match(built.executable, /\/cu-verifier-cuhelper-[0-9a-f]{16}\/CUHelper\.app\/Contents\/MacOS\/CUHelper$/)
    assert.deepEqual(cacheEntries(cache).filter((name) => name.includes('.stage-')), [])
  })

  test('a tree without helper sources is named, not built', () => {
    assert.deepEqual(buildCUHelper(tempDir('empty'), { cacheRoot: tempDir('cache') }), { executable: null, why: 'no CUHelper sources' })
  })
})

describe('isStaleSkeleton', () => {
  test('folders only and untouched past the age: stale', () => {
    const app = join(tempDir('skel'), 'CUHelper.app')
    skeletonAt(app)
    assert.equal(isStaleSkeleton(app, { now: LATER }), true)
  })

  test('a file or a link anywhere below, a young folder, or a missing path: not stale', () => {
    const withFile = join(tempDir('skel'), 'CUHelper.app')
    skeletonAt(withFile)
    writeFileSync(join(withFile, 'Contents', 'MacOS', 'CUHelper'), '')
    assert.equal(isStaleSkeleton(withFile, { now: LATER }), false)

    const withLink = join(tempDir('skel'), 'CUHelper.app')
    skeletonAt(withLink)
    symlinkSync('/nonexistent', join(withLink, 'Contents', 'link'))
    assert.equal(isStaleSkeleton(withLink, { now: LATER }), false)

    const young = join(tempDir('skel'), 'CUHelper.app')
    skeletonAt(young)
    assert.equal(isStaleSkeleton(young), false)

    assert.equal(isStaleSkeleton(join(tempDir('skel'), 'absent')), false)
  })
})
