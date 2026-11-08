import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  CONFIG_ENV,
  DEFAULT_PATHS,
  LocalConfigError,
  PATH_ENV,
  configPath,
  expandHome,
  isAlias,
  isToolsetModel,
  localConfig,
  localPath,
  modelPricing,
  resolveModel,
} from '../../_tools_/agent-core/local-config.mjs'

// The machine-local config (local-config.mjs): every read here goes through an injected env, home and readFile, so
// no test reads the owner's own file.

const HOME = '/home/someone'
const home = () => HOME
const enoent = () => { throw Object.assign(new Error('no such file'), { code: 'ENOENT' }) }
const CONFIG = {
  defaultModel: 'claude-gateway/model-a',
  models: {
    'model-a': { id: 'claude-test-model', toolset: true, pricing: { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 } },
    'model-b': { id: 'claude-other-test-model' },
    'no-id': { toolset: true },
  },
  paths: { dshBin: '/opt/dsh/bin.js', heddleRepo: '~/src/heddle', keyFile: '/keys/gateway.key', nodeBin: '/opt/node/bin/node', project: '~/work/computer-use' },
}

test('where the config is read: $CU_CONFIG when set (a leading ~/ expanded), else ~/.config/computer-use/config.json', () => {
  assert.equal(CONFIG_ENV, 'CU_CONFIG')
  assert.equal(configPath({ env: {}, home }), join(HOME, '.config', 'computer-use', 'config.json'))
  assert.equal(configPath({ env: { CU_CONFIG: '' }, home }), join(HOME, '.config', 'computer-use', 'config.json'), 'an empty variable is unset')
  assert.equal(configPath({ env: { CU_CONFIG: '/etc/cu.json' }, home }), '/etc/cu.json')
  assert.equal(configPath({ env: { CU_CONFIG: '~/cu.json' }, home }), join(HOME, 'cu.json'))
  assert.equal(expandHome('~', home), HOME)
  assert.equal(expandHome('/abs/~/x', home), '/abs/~/x')
})

test('reading: a missing file is {}; the JSON object is returned; invalid JSON, a non-object or an unreadable file is a named error', () => {
  const read = []
  assert.deepEqual(localConfig({ env: {}, home, readFile: (path) => { read.push(path); return enoent() } }), {})
  assert.deepEqual(read, [join(HOME, '.config', 'computer-use', 'config.json')])
  assert.deepEqual(localConfig({ env: { CU_CONFIG: '/c.json' }, home, readFile: () => JSON.stringify(CONFIG) }), CONFIG)
  assert.throws(() => localConfig({ env: { CU_CONFIG: '/c.json' }, home, readFile: () => '{ "models": ' }),
    (error) => error instanceof LocalConfigError && error.code === 'bad_local_config' && /\/c\.json is not valid JSON/.test(error.message) && /CU_CONFIG/.test(error.message))
  for (const text of ['[]', 'null', '"x"', '3']) {
    assert.throws(() => localConfig({ env: {}, home, readFile: () => text }), /must hold a JSON object/, text)
  }
  assert.throws(() => localConfig({ env: {}, home, readFile: () => { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }) } }),
    (error) => error instanceof LocalConfigError && /could not be read: permission denied/.test(error.message))
})

test('the default reader reads $CU_CONFIG from disk: a missing path is {}', () => {
  assert.deepEqual(localConfig({ env: { CU_CONFIG: '/nonexistent/cu-local-config-test/config.json' } }), {})
})

test('resolveModel: an alias becomes its real id; anything else, including an entry without an id, is unchanged', () => {
  assert.equal(resolveModel('model-a', CONFIG), 'claude-test-model')
  assert.equal(resolveModel('model-b', CONFIG), 'claude-other-test-model')
  assert.equal(resolveModel('no-id', CONFIG), 'no-id')
  assert.equal(resolveModel('claude-sonnet-5-5', CONFIG), 'claude-sonnet-5-5')
  assert.equal(resolveModel('model-a', {}), 'model-a')
  assert.equal(resolveModel('model-a'), 'model-a')
  assert.equal(resolveModel('constructor', CONFIG), 'constructor', 'only own keys are models')
  assert.equal(resolveModel('model-a', { models: [] }), 'model-a')
  assert.deepEqual([isAlias('model-a', CONFIG), isAlias('no-id', CONFIG), isAlias('toString', CONFIG), isAlias('model-a', {})], [true, false, false, false])
})

test('isToolsetModel: only an explicit toolset true', () => {
  assert.equal(isToolsetModel('model-a', CONFIG), true)
  assert.equal(isToolsetModel('no-id', CONFIG), true)
  assert.equal(isToolsetModel('model-b', CONFIG), false)
  assert.equal(isToolsetModel('model-c', CONFIG), false)
  assert.equal(isToolsetModel('model-a', { models: { 'model-a': { toolset: 'yes' } } }), false)
  assert.equal(isToolsetModel('model-a', null), false)
})

test('modelPricing: the four prices, frozen; none configured is null; a malformed price is a named error', () => {
  const price = modelPricing('model-a', CONFIG)
  assert.deepEqual(price, { input: 4, cacheWrite: 5, cacheRead: 0.2, output: 20 })
  assert.ok(Object.isFrozen(price))
  assert.equal(modelPricing('model-b', CONFIG), null)
  assert.equal(modelPricing('model-c', CONFIG), null)
  assert.equal(modelPricing('model-a', {}), null)
  for (const pricing of [{ input: 1 }, { input: 1, cacheWrite: 1, cacheRead: 1, output: '2' }, { input: -1, cacheWrite: 1, cacheRead: 1, output: 1 }, [1, 2, 3, 4], 'cheap']) {
    assert.throws(() => modelPricing('m', { models: { m: { id: 'x', pricing } } }), (error) => error instanceof LocalConfigError && /pricing for 'm'/.test(error.message), JSON.stringify(pricing))
  }
  assert.deepEqual(modelPricing('m', { models: { m: { pricing: { input: 1, cacheWrite: 2, cacheRead: 3, output: 4, extra: 9 } } } }), { input: 1, cacheWrite: 2, cacheRead: 3, output: 4 }, 'only the four fields')
})

test('localPath: the environment variable, else the config, else the fallback; ~/ expanded; a relative configured path refused', () => {
  assert.deepEqual(Object.keys(PATH_ENV).sort(), ['dshBin', 'heddleRepo', 'keyFile', 'nodeBin', 'project'])
  const opts = { env: {}, home }
  assert.equal(localPath('dshBin', DEFAULT_PATHS.dshBin, CONFIG, opts), '/opt/dsh/bin.js')
  assert.equal(localPath('heddleRepo', DEFAULT_PATHS.heddleRepo, CONFIG, opts), join(HOME, 'src', 'heddle'))
  assert.equal(localPath('project', DEFAULT_PATHS.project, CONFIG, opts), join(HOME, 'work', 'computer-use'))
  assert.equal(localPath('keyFile', DEFAULT_PATHS.keyFile, {}, opts), join(HOME, '.heddle', 'keys', 'conclave.api.key'), 'the fallback, expanded')
  assert.equal(localPath('heddleRepo', DEFAULT_PATHS.heddleRepo, {}, opts), join(HOME, 'heddle'))
  assert.equal(localPath('nodeBin', '/usr/local/bin/node', { paths: { nodeBin: '' } }, opts), '/usr/local/bin/node', 'an empty entry is unset')
  assert.equal(localPath('keyFile', DEFAULT_PATHS.keyFile, CONFIG, { env: { CU_KEY_FILE: '/env/key' }, home }), '/env/key', 'the variable wins')
  assert.equal(localPath('project', DEFAULT_PATHS.project, CONFIG, { env: { CU_PROJECT: '~/p' }, home }), join(HOME, 'p'))
  assert.equal(localPath('other', '/x', { paths: { other: '/y' } }, { env: { CU_OTHER: '/z' }, home }), '/y', 'an unnamed path has no variable')
  assert.equal(localPath('dshBin', undefined, {}, opts), undefined)
  assert.throws(() => localPath('dshBin', DEFAULT_PATHS.dshBin, { paths: { dshBin: 'bin.js' } }, opts), /'dshBin' must be absolute/)
  assert.throws(() => localPath('dshBin', DEFAULT_PATHS.dshBin, {}, { env: { CU_DSH_BIN: 'rel/bin.js' }, home }), /must be absolute/)
})

test('the defaults name no user: each is under ~/', () => {
  for (const [name, path] of Object.entries(DEFAULT_PATHS)) assert.ok(path.startsWith('~/'), name)
  assert.ok(!('nodeBin' in DEFAULT_PATHS), 'node defaults to the running one, chosen by the caller')
})
