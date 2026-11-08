import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

/**
 * Machine-local settings that never enter the repository: model aliases with their real gateway ids, toolset flags
 * and prices, the default model, and the paths of this machine's tools. The file is optional JSON, read from
 * `$CU_CONFIG`, else `~/.config/computer-use/config.json`; a missing file is `{}`, invalid JSON a named error.
 *
 *   {
 *     "defaultModel": "claude-gateway/model-a",
 *     "models": { "model-a": { "id": "<real gateway id>", "toolset": true,
 *                              "pricing": { "input": 0, "cacheWrite": 0, "cacheRead": 0, "output": 0 } } },
 *     "paths": { "dshBin": "...", "heddleRepo": "...", "keyFile": "...", "nodeBin": "...", "project": "..." }
 *   }
 *
 * The helpers below are pure: each takes the config object (and, where the machine matters, injectable `env`,
 * `home` and `readFile`), so tests never read the owner's own file.
 */

export const CONFIG_ENV = 'CU_CONFIG'
/** The default location, relative to the home directory. */
export const CONFIG_HOME_PATH = Object.freeze(['.config', 'computer-use', 'config.json'])
/** The path names `paths` may hold, each with the environment variable that overrides it. */
export const PATH_ENV = Object.freeze({
  dshBin: 'CU_DSH_BIN',
  heddleRepo: 'CU_HEDDLE_REPO',
  keyFile: 'CU_KEY_FILE',
  nodeBin: 'CU_NODE_BIN',
  project: 'CU_PROJECT',
})
/** Home-relative defaults for the paths a fresh machine is likely to have; `nodeBin` defaults to the running node. */
export const DEFAULT_PATHS = Object.freeze({
  dshBin: '~/.volta/tools/image/packages/@deepseek-ai/dsh/lib/node_modules/@deepseek-ai/dsh/lib/bin.js',
  heddleRepo: '~/heddle',
  keyFile: '~/.heddle/keys/conclave.api.key',
  project: '~/computer-use',
})
const PRICE_FIELDS = Object.freeze(['input', 'cacheWrite', 'cacheRead', 'output'])

export class LocalConfigError extends Error {
  constructor(message) {
    super(message)
    this.name = 'LocalConfigError'
    this.code = 'bad_local_config'
  }
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const nonEmpty = (value) => typeof value === 'string' && value.trim() !== ''

/** `~/x` to `<home>/x`; any other path unchanged. */
export function expandHome(path, home = homedir) {
  if (path === '~') return home()
  return typeof path === 'string' && path.startsWith('~/') ? join(home(), path.slice(2)) : path
}

/** Where the config is read from: `$CU_CONFIG` when set, else `~/.config/computer-use/config.json`. */
export function configPath({ env = process.env, home = homedir } = {}) {
  return nonEmpty(env[CONFIG_ENV]) ? expandHome(env[CONFIG_ENV], home) : join(home(), ...CONFIG_HOME_PATH)
}

/** Read the local config: `{}` when the file does not exist; a LocalConfigError when it is unreadable or not a JSON object. */
export function localConfig({ env = process.env, home = homedir, readFile = (path) => readFileSync(path, 'utf8') } = {}) {
  const path = configPath({ env, home })
  let text
  try {
    text = readFile(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw new LocalConfigError(`the local config ${path} could not be read: ${error?.message ?? error}`)
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new LocalConfigError(`the local config ${path} is not valid JSON (${error.message}); fix it, or point ${CONFIG_ENV} at another file`)
  }
  if (!isObject(parsed)) throw new LocalConfigError(`the local config ${path} must hold a JSON object`)
  return parsed
}

/** The config's entry for a model name, or null. Only own keys count, so `constructor` is never a model. */
function modelEntry(id, cfg) {
  const models = isObject(cfg?.models) ? cfg.models : null
  if (models === null || typeof id !== 'string' || !Object.hasOwn(models, id)) return null
  return isObject(models[id]) ? models[id] : null
}

/** Whether `id` is an alias the config defines (a `models` entry with a real `id`). */
export function isAlias(id, cfg = {}) {
  return nonEmpty(modelEntry(id, cfg)?.id)
}

/** The id to send to the gateway: an alias becomes its configured `id`; any other id is returned unchanged. */
export function resolveModel(id, cfg = {}) {
  const entry = modelEntry(id, cfg)
  return nonEmpty(entry?.id) ? entry.id : id
}

/** Whether the config marks `id` as a model that takes the native computer toolset. */
export function isToolsetModel(id, cfg = {}) {
  return modelEntry(id, cfg)?.toolset === true
}

/**
 * The configured list price of `id` in USD per million tokens, `{ input, cacheWrite, cacheRead, output }`, or null
 * when none is configured. A price that is present but malformed is an error, never a silent "no price".
 */
export function modelPricing(id, cfg = {}) {
  const pricing = modelEntry(id, cfg)?.pricing
  if (pricing === undefined || pricing === null) return null
  const ok = isObject(pricing) && PRICE_FIELDS.every((field) => typeof pricing[field] === 'number' && Number.isFinite(pricing[field]) && pricing[field] >= 0)
  if (!ok) throw new LocalConfigError(`the local config's pricing for '${id}' needs ${PRICE_FIELDS.join(', ')} as numbers of zero or more`)
  return Object.freeze(Object.fromEntries(PRICE_FIELDS.map((field) => [field, pricing[field]])))
}

/**
 * A machine path by name: the environment variable named in PATH_ENV, else the config's `paths[name]`, else
 * `fallback`; a leading `~/` is expanded against the home directory. A relative configured path is an error.
 */
export function localPath(name, fallback, cfg = {}, { env = process.env, home = homedir } = {}) {
  const fromEnv = Object.hasOwn(PATH_ENV, name) ? env[PATH_ENV[name]] : undefined
  const fromConfig = isObject(cfg?.paths) && Object.hasOwn(cfg.paths, name) ? cfg.paths[name] : undefined
  const chosen = nonEmpty(fromEnv) ? fromEnv : nonEmpty(fromConfig) ? fromConfig : fallback
  const path = expandHome(chosen, home)
  if (chosen !== fallback && !isAbsolute(path)) throw new LocalConfigError(`the local path '${name}' must be absolute or start with ~/, not '${chosen}'`)
  return path
}
