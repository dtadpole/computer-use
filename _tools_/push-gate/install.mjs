#!/usr/bin/env node
// CU-337: install the push gate for this repository - `node _tools_/push-gate/install.mjs` sets core.hooksPath to the
// committed hooks folder, a relative path git resolves against each worktree's top level, so every worktree runs its
// own committed hook. `--check` exits 0 only when that is set and this worktree has an executable hooks/pre-push.
import { execFileSync } from 'node:child_process'
import { accessSync, constants, existsSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const HOOKS_PATH = '_tools_/push-gate/hooks'

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** Whether this worktree is guarded: `{ ok, hooksPath, hook, why }`. */
export function check(cwd = process.cwd()) {
  let top
  try { top = git(['rev-parse', '--show-toplevel'], cwd) } catch { return { ok: false, hooksPath: null, hook: null, why: `${cwd} is not inside a git worktree` } }
  let hooksPath = null
  try { hooksPath = git(['config', '--get', 'core.hooksPath'], cwd) } catch { /* unset */ }
  const hook = join(top, HOOKS_PATH, 'pre-push')
  if (hooksPath !== HOOKS_PATH) return { ok: false, hooksPath, hook, why: `core.hooksPath is ${hooksPath === null ? 'unset' : `'${hooksPath}'`}, not '${HOOKS_PATH}' - run node ${HOOKS_PATH.replace(/\/hooks$/, '')}/install.mjs` }
  if (!existsSync(hook)) return { ok: false, hooksPath, hook, why: 'this worktree has no hooks/pre-push (a branch cut before CU-337 landed) - merge origin/main' }
  try { accessSync(hook, constants.X_OK) } catch { return { ok: false, hooksPath, hook, why: 'hooks/pre-push is not executable' } }
  return { ok: true, hooksPath, hook, why: 'guarded' }
}

/** Set core.hooksPath (repeatable); returns the check afterwards. */
export function install(cwd = process.cwd()) {
  git(['config', 'core.hooksPath', HOOKS_PATH], cwd)
  return check(cwd)
}

// Started as a program: real paths on both sides (macOS /tmp is a symlink - CU-79, entry-guards.test.mjs).
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const result = process.argv.includes('--check') ? check() : install()
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exitCode = result.ok ? 0 : 1
}
