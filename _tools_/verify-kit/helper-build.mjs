/**
 * Builds for the desktop helper verifiers, each once per source hash under /tmp: CUHelper from the code under test's
 * own helper/build.sh (ad hoc), and the window-table probe (window-table.swift). Neither build runs anything.
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const hashOf = (...parts) => parts.reduce((hash, part) => hash.update(part), createHash('sha256')).digest('hex').slice(0, 16)

/** CUHelper from `<sutRoot>/_environments_/macos-desktop/helper`; `{ executable, version }` or `{ executable: null, why }`. */
export function buildCUHelper(sutRoot) {
  const script = join(sutRoot, '_environments_/macos-desktop/helper/build.sh')
  if (!existsSync(script)) return { executable: null, why: 'no CUHelper sources' }
  const sources = join(dirname(script), 'Sources')
  const out = `/tmp/cu-verifier-cuhelper-${hashOf(...readdirSync(sources).sort().flatMap((name) => [name, readFileSync(join(sources, name))]), readFileSync(script))}`
  const executable = join(out, 'CUHelper.app', 'Contents', 'MacOS', 'CUHelper')
  if (!existsSync(executable)) {
    mkdirSync(out, { recursive: true })
    try {
      execFileSync('bash', [script, out], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, CU_HELPER_IDENTITY: '' } })
    } catch (error) {
      return { executable: null, why: `CUHelper did not build: ${String(error.stderr ?? error.message).slice(-300)}` }
    }
  }
  if (!existsSync(executable)) return { executable: null, why: `no executable at ${executable}` }
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
