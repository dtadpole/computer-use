#!/usr/bin/env node
/**
 * The owner's one-time step: approve CU Fixture and CU Ledger 'always' for desktop runs, so the unattended desktop
 * suite never stops at the start-app question (P11). Only these two fixture bundle ids can be approved here.
 *
 *   node _tools_/desktop-fixture/approve-always.mjs
 *
 * It asks on the controlling terminal (/dev/tty), never on stdin, so a pipe cannot answer (as `--consent tty`, red team
 * C1); without a terminal it refuses (exit 64). Each 'y' is recorded in the always store ($CU_HOME/app-approvals.json,
 * the one agent core and the suite read) as answered by `tty`. It launches nothing, needs no grant and captures nothing.
 * `cli.mjs apps list | revoke <bundle-id>` shows or undoes it. The residual of tty consent stands: a same-user process
 * that owns a pseudo-terminal can type into it, so this is only as strong as the owner being at that terminal.
 */
import { openSync } from 'node:fs'
import { createInterface } from 'node:readline'
import tty from 'node:tty'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { BUNDLE_ID, APP_NAME, LEDGER } from './build.mjs'

export const FIXTURE_APPS = Object.freeze([
  { bundleId: BUNDLE_ID, name: APP_NAME, why: 'the fixture app every desktop task and injection screen runs in' },
  { bundleId: LEDGER.bundleId, name: LEDGER.name, why: 'the second fixture app, for tasks that span two apps' },
])

/** The controlling terminal as `{ input, output }`, or null when there is none. */
function controllingTerminal() {
  try {
    return { input: new tty.ReadStream(openSync('/dev/tty', 'r')), output: new tty.WriteStream(openSync('/dev/tty', 'w')) }
  } catch {
    return null
  }
}

/** Ask each fixture app in turn on `terminal`; record a 'y' in `store`. Resolves to `{ approved, already, declined }`. */
export async function approveFixtureApps(store, terminal) {
  const { input, output } = terminal
  const rl = createInterface({ input, output, terminal: false })
  const lines = rl[Symbol.asyncIterator]()
  const ask = async (question) => {
    output.write(question)
    const next = await lines.next()
    return next.done ? '' : String(next.value).trim().toLowerCase()
  }
  const result = { approved: [], already: [], declined: [] }
  try {
    for (const app of FIXTURE_APPS) {
      if (store.covers(app.bundleId)) {
        output.write(`${app.name} (${app.bundleId}) is already approved 'always'.\n`)
        result.already.push(app.bundleId)
        continue
      }
      const answer = await ask(`\nApprove ${app.name} (${app.bundleId}) 'always' for desktop runs?\n  ${app.why}.\n  Agents may then act in it without asking each run. [y/N] `)
      if (answer === 'y' || answer === 'yes') {
        store.grantAlways(app.bundleId, { by: 'tty' })
        output.write(`approved ${app.bundleId} 'always'\n`)
        result.approved.push(app.bundleId)
      } else {
        output.write(`not approved; ${app.bundleId} will be asked about in each run\n`)
        result.declined.push(app.bundleId)
      }
    }
  } finally {
    rl.close()
  }
  return result
}

async function main() {
  const terminal = controllingTerminal()
  if (terminal === null) {
    process.stderr.write('approve-always needs your terminal: run it yourself in Terminal; a pipe or a script cannot answer\n')
    return 64
  }
  const here = fileURLToPath(new URL('.', import.meta.url))
  const { createAppApprovals } = await import(pathToFileURL(`${here}../agent-core/app-approvals.mjs`))
  const store = createAppApprovals()
  const result = await approveFixtureApps(store, terminal)
  // list() reads the store back as `{ apps, corrupt }`.
  const { apps = [] } = store.list() ?? {}
  terminal.output.write(`\nThe always store (${store.path}) now approves: ${apps.map((entry) => entry.bundleId).join(', ') || 'nothing'}\n`)
  terminal.input.destroy()
  terminal.output.end()
  return result.declined.length === 0 ? 0 : 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === (await import('node:fs')).realpathSync(process.argv[1])) {
  main().then((code) => {
    process.exitCode = code
  }, (error) => {
    process.stderr.write(`approve-always: ${error.message}\n`)
    process.exitCode = 1
  })
}
