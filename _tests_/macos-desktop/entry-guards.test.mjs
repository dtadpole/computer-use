import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * CU-79's bug class, repo-wide: a module that runs only when started as a program compares process.argv[1] with
 * import.meta.url. Through a symlink (macOS /tmp is /private/tmp) argv[1] keeps the link and import.meta.url is the real
 * file, so a guard comparing them as given silently does nothing - run-lock.mjs's 'hold' took no hold that way. Every
 * such guard must compare real paths.
 */

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ROOTS = ['_tools_', '_evaluators_', '_environments_', '_tests_', '_verifiers_']
const scratch = mkdtempSync(join(tmpdir(), 'cu-entry-'))
after(() => rmSync(scratch, { recursive: true, force: true }))

function* modules(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* modules(path)
    else if (entry.name.endsWith('.mjs')) yield path
  }
}

test('every entry guard comparing process.argv[1] with import.meta.url compares real paths', () => {
  const guards = []
  for (const root of ROOTS) {
    for (const path of modules(join(REPO, root))) {
      if (path === fileURLToPath(import.meta.url)) continue // this scan's own text names both
      readFileSync(path, 'utf8').split('\n').forEach((line, index) => {
        if (/^\s*(if|else if)\b/.test(line) && line.includes('process.argv[1]') && line.includes('import.meta.url')) {
          guards.push({ at: `${relative(REPO, path)}:${index + 1}`, line })
        }
      })
    }
  }
  const unsafe = guards.filter(({ line }) => !/realpath|isEntryPoint|isMain|startedAsProgram/.test(line))
  // The named helpers each compare real paths; a guard written inline must call realpath itself.
  assert.deepEqual(unsafe.map(({ at }) => at), [], 'guards that compare argv[1] and import.meta.url as given')
})

/** Start `file` (relative to the repo) through a symlink to the whole checkout. */
function viaLink(file, args) {
  const link = join(scratch, `repo-${Math.random().toString(36).slice(2)}`)
  symlinkSync(REPO, link)
  return spawnSync(process.execPath, [join(link, file), ...args], { encoding: 'utf8', timeout: 30_000 })
}

test('started through a symlink, the desktop suite and the no-model example run their main (they fail on a bad argument instead of exiting 0 silently)', () => {
  const suite = viaLink('_evaluators_/desktop-suite/run.mjs', ['--no-such-flag'])
  assert.equal(suite.status, 1, suite.stdout + suite.stderr)
  assert.match(suite.stderr, /^desktop-suite: /m)
  const example = viaLink('_tests_/computer-use-mcp/no-model-example.mjs', ['no-such-client'])
  assert.notEqual(example.status, 0, 'the example ran and refused the unknown client')
  assert.notEqual(example.stderr, '', 'it said why')
})
