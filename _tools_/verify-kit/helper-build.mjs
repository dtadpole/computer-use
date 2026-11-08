/**
 * Builds for the desktop helper verifiers, each once per source hash under /tmp: CUHelper from the code under test's
 * own helper/build.sh (ad hoc), and the window-table probe (window-table.swift). Neither build runs anything.
 *
 * CUHelper is built in a fresh staging folder beside its cache folder and renamed into place only when complete, so
 * an aborted build (a gate stopped on local input, CU-216) never leaves a half-built bundle where the next run looks.
 * An empty skeleton an older build left there - folders only, no file, untouched for longer than any build takes - is
 * removed first; a younger one may be a build still running from an older checkout, so it is left alone and this
 * run's build is used from its staging folder instead.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const hashOf = (...parts) => parts.reduce((hash, part) => hash.update(part), createHash('sha256')).digest('hex').slice(0, 16)

/** Far longer than a CUHelper build takes (19 s measured for 0.2.51); a skeleton untouched this long is no live build. */
export const SKELETON_AGE_MS = 10 * 60_000

/** True when `dir` holds folders only - no file or link anywhere below it - and none was touched within `ageMs`. */
export function isStaleSkeleton(dir, { now = Date.now(), ageMs = SKELETON_AGE_MS } = {}) {
  const walk = (path) => {
    const stat = lstatSync(path)
    if (!stat.isDirectory() || now - stat.mtimeMs < ageMs) return false
    return readdirSync(path).every((name) => walk(join(path, name)))
  }
  try {
    return walk(dir)
  } catch {
    return false
  }
}

/** The executable inside a built bundle. */
const executableIn = (app) => join(app, 'Contents', 'MacOS', 'CUHelper')

/**
 * CUHelper from `<sutRoot>/_environments_/macos-desktop/helper`; `{ executable, version }` or `{ executable: null, why }`.
 * `cacheRoot` and `now` exist for the tests.
 */
export function buildCUHelper(sutRoot, { cacheRoot = '/tmp', now = Date.now() } = {}) {
  const script = join(sutRoot, '_environments_/macos-desktop/helper/build.sh')
  if (!existsSync(script)) return { executable: null, why: 'no CUHelper sources' }
  const sources = join(dirname(script), 'Sources')
  const out = join(cacheRoot, `cu-verifier-cuhelper-${hashOf(...readdirSync(sources).sort().flatMap((name) => [name, readFileSync(join(sources, name))]), readFileSync(script))}`)
  const app = join(out, 'CUHelper.app')
  let executable = executableIn(app)
  if (!existsSync(executable)) {
    if (existsSync(app) && isStaleSkeleton(app, { now })) rmSync(app, { recursive: true, force: true })
    mkdirSync(out, { recursive: true })
    const stage = mkdtempSync(`${out}.stage-`)
    try {
      execFileSync('bash', [script, stage], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, CU_HELPER_IDENTITY: '' } })
    } catch (error) {
      rmSync(stage, { recursive: true, force: true })
      return { executable: null, why: `CUHelper did not build: ${String(error.stderr ?? error.message).slice(-300)}` }
    }
    const staged = join(stage, 'CUHelper.app')
    if (!existsSync(executableIn(staged))) {
      rmSync(stage, { recursive: true, force: true })
      return { executable: null, why: `build.sh left no executable at ${executableIn(staged)}` }
    }
    try {
      renameSync(staged, app)
      rmSync(stage, { recursive: true, force: true })
    } catch {
      // Another run of this source landed its build first (use that one), or a young skeleton holds the path (use ours).
      if (existsSync(executable)) rmSync(stage, { recursive: true, force: true })
      else executable = executableIn(staged)
    }
  }
  const version = execFileSync(executable, ['--version'], { encoding: 'utf8' }).match(/(\d+)\.(\d+)\.(\d+)/)
  return { executable, version: version ? version.slice(1).map(Number) : null }
}

/** The window-table probe; resolves its executable path. */
export function buildWindowTable() {
  const source = fileURLToPath(new URL('./window-table.swift', import.meta.url))
  const out = `/tmp/cu-verifier-wt-${hashOf(readFileSync(source))}`
  const executable = join(out, 'window-table')
  if (!existsSync(executable)) {
    mkdirSync(out, { recursive: true })
    execFileSync('swiftc', ['-swift-version', '5', '-O', '-o', executable, source], { stdio: ['ignore', 'ignore', 'pipe'] })
  }
  return executable
}
