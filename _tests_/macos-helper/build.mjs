/**
 * Builds what the macos-helper suite runs, cached under /tmp by a hash of the sources so repeated runs (and every
 * seat) build once: CUHelper.app through the helper's own build.sh, and the Swift unit-test binary from every helper
 * source except main.swift plus UnitTests.swift. Nothing is installed and nothing is launched here.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const HELPER_DIR = join(HERE, '..', '..', '_environments_', 'macos-desktop', 'helper')
export const SOURCES_DIR = join(HELPER_DIR, 'Sources')
const UNIT_TESTS = join(HERE, 'UnitTests.swift')
const FRAMEWORKS = ['AppKit', 'ApplicationServices', 'CoreGraphics', 'ScreenCaptureKit', 'ImageIO', 'Security', 'Carbon'].flatMap((name) => ['-framework', name])

export function helperSources() {
  return readdirSync(SOURCES_DIR).filter((name) => name.endsWith('.swift')).sort()
}

/** A hash of every input of the build: the Swift sources, build.sh and the unit tests. */
export function sourceHash() {
  const hash = createHash('sha256')
  for (const name of helperSources()) hash.update(name).update(readFileSync(join(SOURCES_DIR, name)))
  hash.update('build.sh').update(readFileSync(join(HELPER_DIR, 'build.sh')))
  return hash.update(readFileSync(UNIT_TESTS)).digest('hex').slice(0, 16)
}

/** Build (or reuse) the bundle and the unit-test binary; returns their paths. */
export function buildAll({ cacheRoot = '/tmp' } = {}) {
  const hash = sourceHash()
  const root = join(cacheRoot, `cu-helper-test-${hash}`)
  const app = join(root, 'CUHelper.app')
  const executable = join(app, 'Contents', 'MacOS', 'CUHelper')
  const unitTests = join(root, 'unit-tests')
  if (existsSync(executable) && existsSync(unitTests)) return { root, app, executable, unitTests, hash, cached: true }
  // Build beside, then rename, so a concurrent reader never sees half a build.
  const staging = `${root}.staging-${process.pid}`
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true, mode: 0o700 })
  const env = { ...process.env }
  delete env.CU_HELPER_IDENTITY // tests build ad hoc: a named identity would make codesign use the keychain
  execFileSync('bash', [join(HELPER_DIR, 'build.sh'), staging], { stdio: ['ignore', 'ignore', 'pipe'], env })
  const sources = helperSources().filter((name) => name !== 'main.swift').map((name) => join(SOURCES_DIR, name))
  execFileSync('swiftc', ['-Onone', '-swift-version', '5', '-parse-as-library', '-module-name', 'CUHelperTests', '-target', 'arm64-apple-macosx14.0',
    ...FRAMEWORKS, '-o', join(staging, 'unit-tests'), ...sources, UNIT_TESTS], { stdio: ['ignore', 'ignore', 'pipe'] })
  try {
    renameSync(staging, root)
  } catch {
    // Another run finished first: use its build.
    rmSync(staging, { recursive: true, force: true })
  }
  return { root, app, executable, unitTests, hash, cached: false }
}
