import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'

/**
 * Every verifier's mutants still apply: each find text occurs exactly once in this tree. A change to a mutated line
 * strands its mutant silently - the verifier still passes, but its mutant proof can no longer run - so this turns it
 * red in the node sweep, naming the verifier and the mutant. The author then tells cu-verifier or updates the find text.
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const VERIFIERS = join(ROOT, '_verifiers_')

for (const name of readdirSync(VERIFIERS).filter((dir) => existsSync(join(VERIFIERS, dir, 'mutants.mjs'))).sort()) {
  test(`${name}: every mutant's find text occurs exactly once`, async () => {
    const { MUTANTS } = await import(pathToFileURL(join(VERIFIERS, name, 'mutants.mjs')))
    const stale = []
    for (const mutant of MUTANTS) {
      for (const [index, mutation] of (mutant.mutations ?? []).entries()) {
        const file = join(ROOT, mutation.file)
        const count = existsSync(file) ? readFileSync(file, 'utf8').split(mutation.find).length - 1 : 0
        if (count !== 1) stale.push(`${mutant.name} #${index} in ${mutation.file}: found ${count}`)
      }
    }
    assert.deepEqual(stale, [], `stale mutants in _verifiers_/${name}: tell cu-verifier, or update the find text`)
  })
}
