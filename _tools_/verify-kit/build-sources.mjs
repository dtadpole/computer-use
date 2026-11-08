import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

/**
 * Where a recorded build commit may live (CU-222). The scrubbed root of 8 November holds none of the builds recorded
 * before it: rows from before the split (D-039, 5 November) name reflection's commits, later ones the private history
 * repository's. A build is looked up in this repository, then reflection, then the history checkout.
 *
 * - reflection: `CU_VERIFY_REFLECTION`, else `~/reflection` (as before).
 * - history: `CU_VERIFY_HISTORY`, else `paths.historyRepo` in the machine-local config (`$CU_CONFIG`, else
 *   `~/.config/computer-use/config.json`) - never a path written in the tree (public hygiene); with neither it is absent.
 *
 * Judge-side: the local config file is read here, not through agent-core (D-012).
 */

export const REFLECTION_ENV = 'CU_VERIFY_REFLECTION'
export const HISTORY_ENV = 'CU_VERIFY_HISTORY'
export const HISTORY_CONFIG_KEY = 'historyRepo'
const COMMIT = /^[0-9a-f]{7,40}$/

const nonEmpty = (value) => typeof value === 'string' && value.trim() !== ''
const expandHome = (path, home) => (path === '~' ? home() : path.startsWith('~/') ? join(home(), path.slice(2)) : path)

/** The machine-local config as an object: `{}` when the file does not exist; an Error naming the file when it is not a JSON object. */
export function readLocalConfig({ env = process.env, home = homedir, readFile = (path) => readFileSync(path, 'utf8') } = {}) {
  const path = nonEmpty(env.CU_CONFIG) ? expandHome(env.CU_CONFIG, home) : join(home(), '.config', 'computer-use', 'config.json')
  let text
  try {
    text = readFile(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw new Error(`the local config ${path} could not be read: ${error?.message ?? error}`)
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`the local config ${path} is not valid JSON (${error.message})`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`the local config ${path} must hold a JSON object`)
  return parsed
}

/** Whether `dir` holds a git checkout (a `.git` directory, or a worktree's `.git` file). */
const isCheckout = (dir) => existsSync(join(dir, '.git'))

/**
 * The sources a build is looked up in, in order: `{ name, dir, present, how }`. This repository is always present; a
 * source with no configured path, or whose path holds no checkout, is absent and says how to supply it.
 */
export function buildSources({ env = process.env, home = homedir, config, exists = isCheckout } = {}) {
  const cfg = config ?? readLocalConfig({ env, home })
  const reflection = nonEmpty(env[REFLECTION_ENV])
    ? { dir: expandHome(env[REFLECTION_ENV], home), how: REFLECTION_ENV }
    : { dir: join(home(), 'reflection'), how: '~/reflection' }
  const configured = cfg?.paths !== null && typeof cfg?.paths === 'object' && Object.hasOwn(cfg.paths, HISTORY_CONFIG_KEY) ? cfg.paths[HISTORY_CONFIG_KEY] : undefined
  const history = nonEmpty(env[HISTORY_ENV])
    ? { dir: expandHome(env[HISTORY_ENV], home), how: HISTORY_ENV }
    : nonEmpty(configured)
      ? { dir: expandHome(configured, home), how: `paths.${HISTORY_CONFIG_KEY}` }
      : { dir: null, how: `not configured (set paths.${HISTORY_CONFIG_KEY} in the local config, or ${HISTORY_ENV})` }
  const present = (dir) => dir !== null && isAbsolute(dir) && exists(dir)
  return [
    { name: 'this repository', dir: '.', present: true, how: '.' },
    { name: 'reflection', ...reflection, present: present(reflection.dir) },
    { name: 'history', ...history, present: present(history.dir) },
  ]
}

/** Whether git in `dir` knows `commit` as a commit. Only a hex id is asked, so no record can pass an option to git. */
export function commitIn(dir, commit) {
  if (typeof commit !== 'string' || !COMMIT.test(commit)) return false
  try {
    execFileSync('git', ['-C', dir, 'cat-file', '-e', `${commit}^{commit}`], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * Where `commit` is: `{ found: name }` from the first present source that has it; else `{ found: null, absent }`
 * with the names of the sources that are absent here. An empty `absent` means the build is in no source at all - a
 * failure; a non-empty one means it cannot be judged on this machine.
 */
export function locateBuild(commit, sources, has = commitIn) {
  for (const source of sources) if (source.present && has(source.dir, commit)) return { found: source.name }
  return { found: null, absent: sources.filter((source) => !source.present).map((source) => source.name) }
}

/** One line naming each absent source, where it was looked for and how to supply it. */
export function absentReason(sources) {
  const absent = sources.filter((source) => !source.present)
  if (absent.length === 0) return 'every source is present'
  return absent.map((source) => (source.dir === null ? `${source.name}: ${source.how}` : `${source.name}: no checkout at ${source.dir} (from ${source.how})`)).join('; ')
}
