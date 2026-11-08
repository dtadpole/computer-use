#!/usr/bin/env node
/**
 * Prove a verifier fails on deliberately broken builds (M2 done criterion 3).
 *
 *   node _tools_/verify-kit/prove-failing.mjs <verifier-dir> [--only NAME]
 *
 * Reads `<verifier-dir>/mutants.mjs` (`export const MUTANTS = [{ name, why, mutations }]`), and for each mutant
 * builds a broken copy of agent-core and chrome-browser under /tmp (see `sut.mjs`), runs the verifier's
 * `verify.sh` against it with `CU_VERIFY_SUT`, and removes the copy. A mutant is caught only when the verdict is 1;
 * 0 means the verifier missed the defect and 3 means it could not judge, and both fail this proof. One line of JSON
 * per mutant, then a summary; exit 0 only when every mutant was caught. Run it in the background: each mutant
 * starts a browser.
 */

import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { isThrowawayProfile, removeThrowawayProfile } from './browser-gate.mjs'
import { createMutant } from './sut.mjs'
import { verifySeat } from './seat.mjs'

/** This seat's throwaway profiles under /tmp right now. */
export function seatProfiles(seat = verifySeat(), list = () => readdirSync('/tmp')) {
  return list().filter((name) => name.startsWith(`${seat}-chrome-`)).map((name) => `/tmp/${name}`).filter(isThrowawayProfile)
}

/** Profiles present after a run that were not there before it. Pure. */
export function newProfiles(before, after) {
  const seen = new Set(before)
  return after.filter((path) => !seen.has(path))
}

/** Whether any running process still names `path` (a mutant's Chrome may still hold its profile). */
function inUse(path) {
  return execFileSync('ps', ['-axww', '-o', 'command='], { encoding: 'utf8' }).includes(path)
}

/** Classify one verdict. */
export function outcomeOf(exitCode) {
  if (exitCode === 1) return 'caught'
  if (exitCode === 0) return 'missed'
  return 'unjudged'
}

/** Summarise mutant results: `{ caught, missed, unjudged, ok }`, `ok` only when every mutant was caught. */
export function summarize(results) {
  const count = (outcome) => results.filter((result) => result.outcome === outcome).map((result) => result.name)
  const caught = count('caught')
  return { caught, missed: count('missed'), unjudged: count('unjudged'), ok: results.length > 0 && caught.length === results.length }
}

/** Run `verify.sh` in `verifierDir` against `sutRoot`; resolves to `{ exitCode, failing }`. */
export function runVerifier(verifierDir, sutRoot, { timeoutMs = 600_000 } = {}) {
  return new Promise((resolvePromise) => {
    const child = spawn('sh', [join(verifierDir, 'verify.sh')], { env: { ...process.env, CU_VERIFY_SUT: sutRoot }, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
    child.on('exit', (code) => {
      clearTimeout(timer)
      const failing = output.split('\n').filter((line) => line.startsWith('not ok ')).map((line) => line.replace(/^not ok \d+ - /, ''))
      resolvePromise({ exitCode: code ?? 2, failing, output })
    })
  })
}

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { only: { type: 'string' } } })
  if (positionals.length !== 1) {
    process.stderr.write('usage: prove-failing.mjs <verifier-dir> [--only NAME]\n')
    process.exit(2)
  }
  const verifierDir = resolve(positionals[0])
  const { MUTANTS } = await import(pathToFileURL(join(verifierDir, 'mutants.mjs')).href)
  const chosen = MUTANTS.filter((mutant) => !values.only || mutant.name === values.only)
  const results = []
  for (const mutant of chosen) {
    const built = createMutant({ mutations: mutant.mutations })
    const before = seatProfiles()
    try {
      const started = Date.now()
      const { exitCode, failing, output } = await runVerifier(verifierDir, built.sutRoot)
      // The whole output is kept, so a proof that held for the wrong reason can be seen.
      const logDir = `/tmp/cu-verifier-proofs/${verifierDir.split('/').filter(Boolean).at(-1)}`
      mkdirSync(logDir, { recursive: true })
      writeFileSync(join(logDir, `${mutant.name}.log`), output)
      // A mutant may leak by design (profile-kept does); what it leaked is removed and reported.
      const leaked = newProfiles(before, seatProfiles()).filter((path) => !inUse(path))
      for (const path of leaked) removeThrowawayProfile(path)
      const result = { name: mutant.name, why: mutant.why, exitCode, outcome: outcomeOf(exitCode), failing, removedLeaks: leaked, seconds: Math.round((Date.now() - started) / 1000) }
      results.push(result)
      process.stdout.write(`${JSON.stringify(result)}\n`)
    } finally {
      built.cleanup()
    }
  }
  const summary = summarize(results)
  process.stdout.write(`${JSON.stringify({ summary })}\n`)
  process.exit(summary.ok ? 0 : 1)
}

if (import.meta.main) await main()
