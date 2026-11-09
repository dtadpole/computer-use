#!/usr/bin/env node
/**
 * Applies each table mutant (table-mutants.mjs) alone to a scratch copy of this tree and runs the D-059 and D-061 tables
 * with the TAP reporter: every row a mutant lists must come out 'not ok' (D-065: a failing mutant, not a named one).
 * Rows that fail beyond the list are printed, not counted against it - a guard may also hold live rows.
 * Usage: node _tests_/agent-core/table-mutants-run.mjs [name ...]   (exit 1 when a listed row survives)
 * Not a *.test.mjs file: one run takes about a minute, so the agent-core suite does not carry it.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MUTANTS as CONSENT_MUTANTS } from '../../_verifiers_/desktop-consent/mutants.mjs'
import { TABLE_MUTANTS } from './table-mutants.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const TABLES = ['_tests_/agent-core/consent-routes.test.mjs', '_tests_/agent-core/sensitive-classes.test.mjs']
const wanted = process.argv.slice(2)

const mutationsOf = (mutant) => mutant.from === 'desktop-consent'
  ? CONSENT_MUTANTS.find((one) => one.name === mutant.name)?.mutations ?? null
  : mutant.mutations

let survivors = 0
for (const mutant of TABLE_MUTANTS.filter((one) => wanted.length === 0 || wanted.includes(one.name))) {
  const mutations = mutationsOf(mutant)
  if (!mutations) {
    console.log(`${mutant.name}: no such desktop-consent mutant`)
    survivors += 1
    continue
  }
  const scratch = mkdtempSync(join(tmpdir(), 'table-mutant-'))
  try {
    for (const folder of ['_tools_', '_tests_', '_verifiers_', '_environments_']) cpSync(join(ROOT, folder), join(scratch, folder), { recursive: true })
    for (const { file, find, replace } of mutations) {
      const path = join(scratch, file)
      const text = readFileSync(path, 'utf8')
      if (text.split(find).length !== 2) throw new Error(`${mutant.name}: the find text is not unique in ${file}`)
      writeFileSync(path, text.replace(find, replace))
    }
    const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...TABLES], { cwd: scratch, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    const failed = new Set(run.stdout.split('\n').filter((line) => /^\s*not ok \d+ - /.test(line) && !/# TODO/.test(line)).map((line) => line.replace(/^\s*not ok \d+ - /, '').trim()))
    const failedRow = (row) => [...failed].some((title) => title.startsWith(row))
    const survived = mutant.rows.filter((row) => !failedRow(row))
    const extra = [...failed].filter((title) => !mutant.rows.some((row) => title.startsWith(row)) && !/^(system rows|consent routes|sensitive classes)/i.test(title))
    survivors += survived.length
    console.log(`${mutant.name}: ${mutant.rows.length - survived.length}/${mutant.rows.length} listed rows fail${survived.length ? `; SURVIVED: ${survived.join(', ')}` : ''}${extra.length ? `; also failing: ${extra.length}` : ''}`)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}
process.exit(survivors === 0 ? 0 : 1)
