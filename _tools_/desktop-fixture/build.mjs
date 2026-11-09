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

/**
 * CU-360: the URL scheme CU Fixture declares (CU Ledger declares none), so a probe can measure whether a browser opens
 * a registered app scheme with the team's own app. The build never registers it with LaunchServices: the probe
 * registers the bundle before it runs and unregisters it afterwards. A GetURL event is logged as `openURL` (Evidence.swift).
 */
export const PROBE_URL_SCHEME = 'x-cu-fixture-probe'
export const PROBE_URL_NAME = 'ai.reflection.cu.fixture.probe'
/** CU-360 (cu-coordinator 17:58Z): only a probe-only bundle declares the scheme, under its own id, so it is the scheme's
 * single claimant - every cached CU Fixture build shares BUNDLE_ID and declares none. */
export const PROBE_BUNDLE_ID = PROBE_URL_NAME
export const PROBE_APP_NAME = 'CU Fixture Probe'

const urlTypes = (bundleId) => (bundleId !== PROBE_BUNDLE_ID ? '' : `  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key><string>${PROBE_URL_NAME}</string>
      <key>CFBundleURLSchemes</key><array><string>${PROBE_URL_SCHEME}</string></array>
    </dict>
  </array>
`)

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
${urlTypes(bundleId)}</dict>
</plist>
`
}

/** A hash of every Swift source and the plist template: the cache key. */
export function sourceHash(dir = SOURCES) {
  const hash = createHash('sha256')
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.swift')).sort()) hash.update(name).update(readFileSync(join(dir, name)))
  return hash.update(infoPlist()).update(infoPlist(LEDGER)).digest('hex').slice(0, 16)
}

/** Build (or reuse) the app; resolves the bundle path and its executable. */
export function buildFixtureApp({ dir = SOURCES, cacheRoot = '/tmp' } = {}) {
  const hash = sourceHash(dir)
  const root = join(cacheRoot, `cu-desktop-fixture-${hash}`)
  const app = join(root, `${APP_NAME}.app`)
  const executable = join(app, 'Contents', 'MacOS', EXECUTABLE)
  const ledgerApp = join(root, `${LEDGER.name}.app`)
  const ledger = { app: ledgerApp, executable: join(ledgerApp, 'Contents', 'MacOS', EXECUTABLE), bundleId: LEDGER.bundleId }
  if (existsSync(executable) && existsSync(ledger.executable)) return { app, executable, bundleId: BUNDLE_ID, hash, cached: true, ledger }
  // Build beside, then rename into place, so a reader never sees a half-built bundle.
  const staging = `${root}.staging-${process.pid}`
  rmSync(staging, { recursive: true, force: true })
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
  placeBuild(staging, root, [executable, ledger.executable])
  return { app, executable, bundleId: BUNDLE_ID, hash, cached: false, ledger }
}

/**
 * CU-360: a probe-only copy of CU Fixture in `into` (a scratch directory the probe owns and removes): the same
 * executable, its own bundle id (PROBE_BUNDLE_ID) and the one bundle declaring PROBE_URL_SCHEME. Never cached, never
 * registered here - the probe registers it with LaunchServices for its run only and unregisters it in a trap.
 */
export function buildProbeApp({ into, dir = SOURCES, cacheRoot = '/tmp' } = {}) {
  if (typeof into !== 'string' || into === '') throw new Error('buildProbeApp needs into: a scratch directory the probe owns')
  const base = buildFixtureApp({ dir, cacheRoot })
  const app = join(into, `${PROBE_APP_NAME}.app`)
  rmSync(app, { recursive: true, force: true })
  mkdirSync(join(app, 'Contents', 'MacOS'), { recursive: true })
  const executable = join(app, 'Contents', 'MacOS', EXECUTABLE)
  copyFileSync(base.executable, executable)
  chmodSync(executable, 0o755)
  writeFileSync(join(app, 'Contents', 'Info.plist'), infoPlist({ bundleId: PROBE_BUNDLE_ID, name: PROBE_APP_NAME }))
  execFileSync('codesign', ['--force', '--sign', '-', '--identifier', PROBE_BUNDLE_ID, app], { stdio: ['ignore', 'ignore', 'pipe'] })
  return { app, executable, bundleId: PROBE_BUNDLE_ID }
}

/**
 * Move a finished staging build into place. Builds of one source hash are identical, so when another process (a
 * parallel test file, another seat) got there first, its complete bundle is used and ours is dropped: renaming onto
 * a non-empty directory fails with ENOTEMPTY on macOS (CU-141, a gate's before-hook cancelled). An incomplete root is
 * not a winner: the error stands.
 */
export function placeBuild(staging, root, executables, { rename = renameSync } = {}) {
  const complete = () => executables.every((path) => existsSync(path))
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
