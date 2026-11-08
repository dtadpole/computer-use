import { existsSync } from 'node:fs'
import { describe, test } from 'node:test'

import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { buildCUHelper } from '../../_tools_/verify-kit/helper-build.mjs'
import { startSocketHelper, startStdioHelper } from '../../_tools_/verify-kit/helper-client.mjs'
import { CONFORMANCE, DESIGN_EXCLUSIONS } from '../../_tools_/verify-kit/helper-conformance.mjs'
import { loadSut } from '../../_tools_/verify-kit/sut.mjs'

/**
 * ULTIMATE_GOAL 2.0 environment and consent rows, protocol half: a desktop helper speaks desktop-extension 0.2 -
 * an opening hello with its grants and the launcher's token, refusals by name, no capture before a scope, every
 * excluded app of the design refused by bundle id, no input before the owner's grant, a local-input report that
 * pauses, and an exit on bye.
 *
 * Judged against two helpers: cu-developer-two's fake helper (the protocol's reference, over stdio, told the design's
 * exclusions and no grants), and CUHelper itself, built by its own build.sh and served over a mode-700 socket as the
 * driver serves it. Before the owner's grant nothing here captures, posts input or raises a TCC prompt (D-024).
 */

const sut = await loadSut()

/** M7 runs the M7 checks only (an M7 acceptance); the default runs every check the design specifies. */
const milestone = process.env.CU_VERIFY_MILESTONE ?? 'M8'
const inScope = (check) => check.milestone <= milestone

const exitsOf = (helper) => (ms) => Promise.race([helper.exited.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), ms))])

describe('the fake helper (stdio)', () => {
  const ready = existsSync(sut.fakeHelper)
  // Screen granted, so capture before scope must be no_scope; accessibility not, so input must be not_granted.
  const config = JSON.stringify({ grants: { screen: true, accessibility: false, listenEvents: false }, excluded: DESIGN_EXCLUSIONS })
  for (const check of CONFORMANCE) {
    test(check.name, { timeout: 20_000 }, async (t) => {
      if (!skipUnless(t, inScope(check), `${check.milestone} check, outside ${milestone}`)) return
      if (!skipUnless(t, ready, `no fake helper at ${sut.fakeHelper}`)) return
      const helper = await startStdioHelper(process.execPath, [sut.fakeHelper], { env: { ...process.env, FAKE_HELPER_CONFIG: config, FAKE_HELPER_TOKEN: 'cu-verifier' } })
      try {
        await check.run(helper, { exits: exitsOf(helper) })
      } finally {
        await helper.close()
      }
    })
  }
})

describe('CUHelper (socket, before the grant)', () => {
  const built = buildCUHelper(sut.root)
  for (const check of CONFORMANCE) {
    test(check.name, { timeout: 30_000 }, async (t) => {
      if (!skipUnless(t, inScope(check), `${check.milestone} check, outside ${milestone}`)) return
      if (!skipUnless(t, Boolean(built.executable), built.why)) return
      const helper = await startSocketHelper(built.executable)
      try {
        await check.run(helper, { exits: exitsOf(helper) })
      } finally {
        await helper.close()
      }
    })
  }
})
