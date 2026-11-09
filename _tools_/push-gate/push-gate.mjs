import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import { DEFAULT_PATHS, expandHome, localConfig, localPath } from '../agent-core/local-config.mjs'

/**
 * CU-337 (D-097): the push gate - git's pre-push hook runs the public-hygiene gate over exactly what each pushed ref
 * adds, unpiped, and the push goes ahead only when every run exits 0. Twice on 9 Nov a gate FAIL piped into `tail`
 * let a push through (#249, #275); here nothing reads the gate's output, only its exit status.
 *
 * The gate itself lives outside this public repository. Its path comes from the machine, never from the tree: the
 * environment's CU_HYGIENE_GATE, else the local config's `paths.hygieneGate`, else the heddle checkout's
 * `_tools_/public-hygiene/gate.mjs` (`paths.heddleRepo`, local-config.mjs). A path that does not resolve to a file
 * refuses the push - the hook fails closed.
 */

export const ZERO_SHA = '0'.repeat(40)
export const GATE_ENV = 'CU_HYGIENE_GATE'
/** The gate's exit statuses (heddle public-hygiene gate.mjs). */
export const GATE_CLEAN = 0
export const GATE_FINDINGS = 1
export const GATE_CANNOT_RUN = 2

const SHA = /^[0-9a-f]{40}$/

/**
 * The lines git writes to a pre-push hook's stdin, one per pushed ref: `<local ref> <local sha> <remote ref> <remote
 * sha>`. A line that is not four fields of that shape is an error - a hook that guessed would let a push through.
 */
export function parsePushLines(text) {
  return String(text).split('\n').map((line) => line.trim()).filter((line) => line !== '').map((line) => {
    const [localRef, localSha, remoteRef, remoteSha, extra] = line.split(/\s+/)
    if (extra !== undefined || !SHA.test(localSha ?? '') || !SHA.test(remoteSha ?? '') || !localRef || !remoteRef) {
      throw new Error(`push-gate: cannot read the pushed ref '${line}'`)
    }
    return { localRef, localSha, remoteRef, remoteSha }
  })
}

/**
 * What each ref adds beyond the remote's main, as a gate range: `<remote>/main..<local sha>` for a new branch and an
 * update alike; a delete adds nothing and is skipped (null range). Never `<remote sha>..<local sha>`: after a branch
 * merges origin/main (D-079/D-090) that range takes in main's own commits - GitHub's merge commits fail the gate's
 * identity rule though nothing new is flagged (cu-verifier and cu-integrator, 13:04Z on 9 Nov). The gate diffs
 * three-dot from the merge base, so this range is exactly the branch's own commits and changes.
 */
export function rangeFor(ref, remote = 'origin') {
  if (ref.localSha === ZERO_SHA) return null
  return `${remote}/main..${ref.localSha}`
}

/** The gate script's absolute path for this machine, or throws naming how to set it. */
export function resolveGate({ env = process.env, cfg = null, exists = existsSync } = {}) {
  const config = cfg ?? localConfig({ env })
  const configured = env[GATE_ENV] || (typeof config?.paths?.hygieneGate === 'string' && config.paths.hygieneGate !== '' ? config.paths.hygieneGate : null)
  const gate = configured !== null && configured !== undefined
    ? expandHome(configured)
    : join(localPath('heddleRepo', DEFAULT_PATHS.heddleRepo, config, { env }), '_tools_', 'public-hygiene', 'gate.mjs')
  if (!isAbsolute(gate) || !exists(gate) || !isFile(gate)) {
    throw new Error(`push-gate: no public-hygiene gate at ${configured ? `${GATE_ENV}/paths.hygieneGate` : 'the heddle checkout'} - set ${GATE_ENV} or paths.hygieneGate in the local config to the gate.mjs file; the push is refused until then`)
  }
  return gate
}

function isFile(path) {
  try { return statSync(path).isFile() } catch { return false }
}

/** Run the gate over one range, unpiped (its report goes straight to the terminal); resolves to its exit status. */
export function runGate(gate, range, { cwd = process.cwd(), env = process.env, spawn = spawnSync, nodeBin = process.execPath } = {}) {
  const result = spawn(nodeBin, [gate, '--range', range], { cwd, env, stdio: ['ignore', 'inherit', 'inherit'] })
  if (result.error) return GATE_CANNOT_RUN
  // A gate killed by a signal has no status: it did not say clean.
  return Number.isInteger(result.status) ? result.status : GATE_CANNOT_RUN
}

/**
 * The hook: refs from stdin, the remote's name from git's first argument. Every added range is gated; the push is
 * refused (1) when any run exits non-zero, when a line cannot be read, or when no gate is configured. Resolves to the
 * hook's exit status.
 */
export function prePush({ input, remote = 'origin', cwd = process.cwd(), env = process.env, cfg = null, spawn = spawnSync, log = (line) => process.stderr.write(`${line}\n`) } = {}) {
  let refs
  let gate
  try {
    refs = parsePushLines(input)
    const ranges = refs.map((ref) => rangeFor(ref, remote)).filter((range) => range !== null)
    if (ranges.length === 0) return 0
    gate = resolveGate({ env, cfg })
    for (const range of ranges) {
      const status = runGate(gate, range, { cwd, env, spawn })
      if (status !== GATE_CLEAN) {
        const why = status === GATE_FINDINGS ? 'it found terms that must not be public' : 'it could not run'
        log(`push-gate: the public-hygiene gate exited ${status} on ${range} (${why}) - push refused (D-097, CU-337)`)
        return 1
      }
    }
    return 0
  } catch (error) {
    log(error.message)
    return 1
  }
}
