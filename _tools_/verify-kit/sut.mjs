/**
 * The system under test, loaded through its public surface, and deliberately broken copies of it.
 *
 * A verifier imports agent-core and the chrome-browser driver only as the system under test (D-012), from
 * `CU_VERIFY_SUT` when set (a computer-use root), else from this tree. `createMutant` copies `agent-core`,
 * `live-view` and `chrome-browser` into `/tmp/cu-verifier-mutant-XXXXXX` with the same relative layout, links `_vendor_`, and
 * applies exact-once text replacements, so a verifier can be shown to fail on a deliberately broken build (M2
 * done criterion 3) without touching the real tree.
 */

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** This tree's computer-use root. */
export const DEFAULT_SUT_ROOT = fileURLToPath(new URL('../../', import.meta.url))

/** The folders a mutant copies, relative to the computer-use root. */
// live-view too: cli.mjs run loads it by path, so a mutant without it cannot start a CLI run.
// macos-desktop (the desktop driver and the fake helper) is copied once it exists.
export const SUT_FOLDERS = Object.freeze(['_tools_/agent-core', '_tools_/live-view', '_tools_/computer-use-mcp', '_environments_/chrome-browser', '_environments_/macos-desktop'])

/** The computer-use root to judge: `CU_VERIFY_SUT`, else this tree. */
export function sutRoot(env = process.env) {
  return env.CU_VERIFY_SUT ? resolve(env.CU_VERIFY_SUT) : DEFAULT_SUT_ROOT
}

/** Import the system under test: agent-core's `lib.mjs` and the chrome-browser driver. */
export async function loadSut(root = sutRoot()) {
  const lib = await import(pathToFileURL(join(root, '_tools_/agent-core/lib.mjs')).href)
  const environment = await import(pathToFileURL(join(root, '_environments_/chrome-browser/environment.mjs')).href)
  return { root, lib, launchBrowserEnvironment: environment.launchBrowserEnvironment, cli: join(root, '_tools_/agent-core/cli.mjs'), mcpServer: join(root, '_tools_/computer-use-mcp/server.mjs'), fakeHelper: join(root, '_tests_/macos-desktop/fake-helper.mjs'), helperBuild: join(root, '_environments_/macos-desktop/helper/build.sh') }
}

/** Whether `path` is a mutant directory this kit may delete. */
export function isMutantDir(path) {
  return typeof path === 'string' && resolve(path) === path && /^\/tmp\/cu-verifier-mutant-[A-Za-z0-9]{6}$/.test(path)
}

/** Apply one exact-once replacement to a text; throws when `find` occurs zero or several times. */
export function applyMutation(text, { find, replace }, label = 'mutation') {
  const count = text.split(find).length - 1
  if (count !== 1) throw new Error(`${label}: expected exactly one occurrence of the find text, found ${count}`)
  return text.replace(find, () => replace)
}

/**
 * Build a broken copy. `mutations` is `[{ file, find, replace }]`, `file` relative to the computer-use root and
 * inside one of `SUT_FOLDERS`. Returns `{ dir, sutRoot, cleanup }`.
 */
export function createMutant({ root = DEFAULT_SUT_ROOT, mutations = [], make = mkdtempSync } = {}) {
  const dir = make('/tmp/cu-verifier-mutant-')
  const remove = () => removeMutant(dir)
  try {
    const realRoot = realpathSync(root)
    // The repository's own layout (D-039): the mutant directory is the root, as this checkout's root is.
    const mutantRoot = dir
    for (const folder of SUT_FOLDERS) {
      mkdirSync(dirname(join(mutantRoot, folder)), { recursive: true })
      if (!existsSync(join(realRoot, folder))) continue
      cpSync(join(realRoot, folder), join(mutantRoot, folder), { recursive: true })
    }
    // Vendored code (browser-use, CU-1 and CU-3) is linked, never copied or mutated.
    if (existsSync(join(realRoot, '_vendor_'))) symlinkSync(realpathSync(join(realRoot, '_vendor_')), join(dir, '_vendor_'))
    for (const [index, mutation] of mutations.entries()) {
      if (!SUT_FOLDERS.some((folder) => mutation.file.startsWith(`${folder}/`))) throw new Error(`mutation ${index}: ${mutation.file} is outside the copied folders`)
      const path = join(mutantRoot, mutation.file)
      writeFileSync(path, applyMutation(readFileSync(path, 'utf8'), mutation, `mutation ${index} (${mutation.file})`))
    }
    // The real path: on macOS /tmp is a link to /private/tmp, and a CLI whose argv path differs from its own
    // module URL takes itself for an import and silently does nothing (measured 2026-11-01).
    return { dir, sutRoot: `${realpathSync(mutantRoot)}/`, cleanup: remove }
  } catch (error) {
    remove()
    throw error
  }
}

/** Remove a mutant directory; refuses any other path. */
export function removeMutant(dir, remove = rmSync) {
  if (!isMutantDir(dir)) throw new Error(`refusing to remove ${JSON.stringify(dir)}: not a /tmp/cu-verifier-mutant-XXXXXX directory`)
  remove(dir, { recursive: true, force: true })
}

/** Environment variables that make node load other code; the helper and startRun refuse a driver holding any. */
export const isLoaderVariable = (name) => /^(DYLD_|LD_)/.test(name) || ['NODE_OPTIONS', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE', 'NODE_ICU_DATA'].includes(name)

/** A copy of `env` without the loader variables: how a desktop run is started (the owner's clean shell). */
export const cleanEnvironment = (env = process.env) => Object.fromEntries(Object.entries(env).filter(([name]) => !isLoaderVariable(name)))
