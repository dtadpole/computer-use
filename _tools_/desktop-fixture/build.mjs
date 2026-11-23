/**
 * Build CU Fixture.app from `app/*.swift` with swiftc (no Xcode project, no npm): a bundle with a stable identity,
 * ad-hoc signed, cached under /tmp by a hash of its sources so every seat builds the same app once.
 *
 *   node _tools_/desktop-fixture/build.mjs        prints { app, executable, bundleId, hash }
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SOURCES = join(HERE, 'app')
export const BUNDLE_ID = 'ai.reflection.cu.fixture'
export const APP_NAME = 'CU Fixture'
export const EXECUTABLE = 'cu-fixture'
/** The second app for two-app tasks: the same executable under its own identity, so approval sees two apps. */
export const LEDGER = Object.freeze({ bundleId: 'ai.reflection.cu.ledger', name: 'CU Ledger' })

/** The Info.plist of the bundle: a stable identifier, so per-app approval can name it. */
export function infoPlist({ bundleId = BUNDLE_ID, name = APP_NAME, executable = EXECUTABLE, version = '1' } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>${bundleId}</string>
  <key>CFBundleName</key><string>${name}</string>
  <key>CFBundleExecutable</key><string>${executable}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`
}

/** A hash of every Swift source and the plist template: the cache key. */
export function sourceHash(dir = SOURCES) {
  const hash = createHash('sha256')
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.swift')).sort()) hash.update(name).update(readFileSync(join(dir, name)))
  return hash.update(infoPlist()).update(infoPlist(LEDGER)).digest('hex').slice(0, 16)
}

const codesignVerify = (bundle) => execFileSync('/usr/bin/codesign', ['--verify', '--strict', bundle], { stdio: 'ignore', timeout: 30_000 })

/**
 * CU-653: a cached app counts only when it is whole. The 21 Nov ~08:00Z host tmp cleanup took Info.plist from every
 * cached fixture app and left the recently-run executables. This cache used to look at the executables alone, so the
 * half bundles still counted as built, and the desktop-fixture verifier's 'two apps with stable identities' failed on
 * main until the caches were moved aside: the twin of the helper cache (#1153). The ad hoc seal names every file in the
 * bundle, so `codesign --verify --strict` catches any loss. Only codesign's own refusal (an exit status) means broken:
 * a spawn error or a timeout under load says nothing about the bundle, and calling a good shared cache broken would
 * set it aside under another seat's run. `verify` is injectable for the rows that need no bundle.
 */
export function bundleComplete(app, executable, { verify = codesignVerify } = {}) {
  if (![executable, join(app, 'Contents', 'Info.plist')].every((path) => existsSync(path))) return false
  try {
    verify(app)
    return true
  } catch (error) {
    return !(Number.isInteger(error?.status) && error.status > 0)
  }
}

/**
 * Set an incomplete cache root aside and remove it, so the build that follows can be renamed into place (CU-653: left
 * in place it fails placeBuild's rename with ENOTEMPTY). A root that became whole meanwhile - another process's build
 * of the same sources - is kept; resolves whether a root was removed.
 */
export function discardIncomplete(root, whole, { rename = renameSync } = {}) {
  if (!existsSync(root) || whole()) return false
  const aside = `${root}.broken-${process.pid}`
  try {
    rename(root, aside)
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
  rmSync(aside, { recursive: true, force: true })
  return true
}

/**
 * Build (or reuse) the app; resolves the bundle path and its executable. `verify` and `compile` are injectable for
 * the rows that pin the cache without a bundle or a compile.
 */
export function buildFixtureApp({ dir = SOURCES, cacheRoot = '/tmp', verify = codesignVerify, compile = compileFixture } = {}) {
  const hash = sourceHash(dir)
  const root = join(cacheRoot, `cu-desktop-fixture-${hash}`)
  const app = join(root, `${APP_NAME}.app`)
  const executable = join(app, 'Contents', 'MacOS', EXECUTABLE)
  const ledgerApp = join(root, `${LEDGER.name}.app`)
  const ledger = { app: ledgerApp, executable: join(ledgerApp, 'Contents', 'MacOS', EXECUTABLE), bundleId: LEDGER.bundleId }
  const whole = () => bundleComplete(app, executable, { verify }) && bundleComplete(ledgerApp, ledger.executable, { verify })
  if (whole()) return { app, executable, bundleId: BUNDLE_ID, hash, cached: true, ledger }
  discardIncomplete(root, whole)
  // Build beside, then rename into place, so a reader never sees a half-built bundle.
  const staging = `${root}.staging-${process.pid}`
  rmSync(staging, { recursive: true, force: true })
  compile(staging, dir)
  placeBuild(staging, root, [executable, ledger.executable], { complete: whole })
  return { app, executable, bundleId: BUNDLE_ID, hash, cached: false, ledger }
}

/** Compile both apps into `staging`: CU Fixture from the Swift sources, CU Ledger as its copy under its own identity. */
export function compileFixture(staging, dir = SOURCES) {
  const stagedApp = join(staging, `${APP_NAME}.app`)
  mkdirSync(join(stagedApp, 'Contents', 'MacOS'), { recursive: true })
  const sources = readdirSync(dir).filter((file) => file.endsWith('.swift')).sort().map((file) => join(dir, file))
  execFileSync('swiftc', ['-swift-version', '5', '-O', '-o', join(stagedApp, 'Contents', 'MacOS', EXECUTABLE), ...sources], { stdio: ['ignore', 'ignore', 'pipe'] })
  writeFileSync(join(stagedApp, 'Contents', 'Info.plist'), infoPlist())
  // Ad-hoc signature: a stable code identity without any certificate or keychain access.
  execFileSync('codesign', ['--force', '--sign', '-', '--identifier', BUNDLE_ID, stagedApp], { stdio: ['ignore', 'ignore', 'pipe'] })
  const stagedLedger = join(staging, `${LEDGER.name}.app`)
  mkdirSync(join(stagedLedger, 'Contents', 'MacOS'), { recursive: true })
  copyFileSync(join(stagedApp, 'Contents', 'MacOS', EXECUTABLE), join(stagedLedger, 'Contents', 'MacOS', EXECUTABLE))
  chmodSync(join(stagedLedger, 'Contents', 'MacOS', EXECUTABLE), 0o755)
  writeFileSync(join(stagedLedger, 'Contents', 'Info.plist'), infoPlist(LEDGER))
  execFileSync('codesign', ['--force', '--sign', '-', '--identifier', LEDGER.bundleId, stagedLedger], { stdio: ['ignore', 'ignore', 'pipe'] })
}

/**
 * Move a finished staging build into place. Builds of one source hash are identical, so when another process (a
 * parallel test file, another seat) got there first, its complete bundle is used and ours is dropped: renaming onto
 * a non-empty directory fails with ENOTEMPTY on macOS (CU-141, a gate's before-hook cancelled). An incomplete root is
 * not a winner: the error stands. `complete` defaults to the executables' presence; buildFixtureApp passes its
 * whole-bundle check (CU-653).
 */
export function placeBuild(staging, root, executables, { rename = renameSync, complete = () => executables.every((path) => existsSync(path)) } = {}) {
  if (complete()) return rmSync(staging, { recursive: true, force: true })
  mkdirSync(dirname(root), { recursive: true })
  try {
    rename(staging, root)
  } catch (error) {
    if ((error.code === 'ENOTEMPTY' || error.code === 'EEXIST') && complete()) return rmSync(staging, { recursive: true, force: true })
    throw error
  }
}

// Started as a program, through any symlink (macOS /tmp is one): process.argv[1] keeps the link while import.meta.url
// is the real file, so the two are compared as real paths; compared as given, a start via /tmp did nothing (CU-79).
const startedAsProgram = () => {
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
}
if (process.argv[1] && startedAsProgram()) {
  process.stdout.write(`${JSON.stringify(buildFixtureApp(), null, 2)}\n`)
}
