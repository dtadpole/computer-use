import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createAppApprovals } from '../../_tools_/agent-core/app-approvals.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'
import { CARD } from '../fixture-shapes/shapes.mjs'

// CU-230 (paste-consent.md): a paste chord is Command or Control with V, whatever else is held - Command-Option-Shift-V
// (Paste and Match Style) and Command-Shift-V paste too, so every paste check runs on them. A desktop copy chord stays
// exact (a modified copy that writes the pasteboard only breaks the count proof, so the paste asks); a browser copy
// follows the driver's map - Command or Control with C or X, Shift allowed, no Option.

const FIXTURE = 'ai.reflection.cu.fixture'
const frame = { width: 1440, height: 900 }
const key = (...keys) => ({ type: 'keypress', keys })
const COPY = key('META', 'C')
const PASTE = key('META', 'V')
const MODIFIED_PASTES = [key('META', 'SHIFT', 'V'), key('META', 'ALT', 'SHIFT', 'V'), key('META', 'ALT', 'V'), key('CTRL', 'SHIFT', 'V')]
const label = (action) => action.keys.join('+')
// Every chord that writes the pasteboard in these worlds: Command or Control with C, with any modifiers.
const writesBoard = (a) => a.type === 'keypress' && (a.keys.includes('META') || a.keys.includes('CTRL')) && a.keys.includes('C')

/** One desktop run: the focused field is `sources[i]` before action i, an unnamed entry after; the count rises with each write. */
async function desktop(actions, { sources = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-230-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control })
    environment.focusedElement = async () => {
      const done = environment.log.length
      const name = done < sources.length ? sources[done] : ''
      return { origin: FIXTURE, role: 'AXTextField', name, editable: true, fingerprint: `f${done}`, pasteboardChangeCount: 41 + environment.log.filter(writesBoard).length }
    }
    const store = createAppApprovals({ path: join(dir, 'a.json') })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame, turns: [{ actions }, { final: 'done' }] })
    const result = await runTask({ task: 'fill', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    return [...new Map(readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').map((e) => [`${e.step}:${e.index}`, e])).values()]
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** One browser run: `clip` is the run clipboard at the start; a copy chord the driver honours writes `writes` into it. */
async function browser(actions, { clip = '', writes = null, sources = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-230-b-'))
  try {
    const START = 'http://127.0.0.1:43117/tasks/demo/'
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: START, control })
    let buffer = clip
    environment.clipboard = { get: () => buffer }
    const perform = environment.perform.bind(environment)
    environment.perform = async (action) => {
      const effect = await perform(action)
      // The Chrome driver's map (chordMeaning): Command or Control with C, Shift allowed, never Option.
      if (writes !== null && writesBoard(action) && !action.keys.includes('ALT')) buffer = writes
      return effect
    }
    environment.focusedElement = async () => {
      const done = environment.log.length
      return { tag: 'input', role: 'textbox', name: done < sources.length ? sources[done] : 'Comments', editable: true, origin: 'http://127.0.0.1:43117', fingerprint: `f${done}` }
    }
    const model = createScriptedAdapter({ frame, turns: [{ actions }, { final: 'done' }] })
    const result = await runTask({ task: 'leave a comment', environment, model, sitePolicy: createSitePolicy({ startUrl: START }), control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false } })
    return [...new Map(readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').map((e) => [`${e.step}:${e.index}`, e])).values()]
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('CU-230 desktop: Paste and Match Style and Command-Shift-V with no own copy paste the owner\'s board - asked', async () => {
  for (const chord of MODIFIED_PASTES) {
    const [paste] = await desktop([chord])
    assert.deepEqual([paste.decision, paste.class], ['confirm', 'sensitive_data'], label(chord))
    assert.deepEqual([paste.pasteboard?.kind, paste.pasteboard?.own], ['paste', false], `${label(chord)}: judged as a paste`)
  }
})

test('CU-230 desktop: after the run\'s own copy, proven by the count, a modified paste is allowed - and carries the source\'s class', async () => {
  for (const chord of MODIFIED_PASTES) {
    const [, plain] = await desktop([COPY, chord], { sources: ['Notes'] })
    assert.deepEqual([plain.decision, plain.pasteboard?.own, plain.pasteboard?.by], ['allow', true, 'count'], `${label(chord)} from Notes`)
    const [, iban] = await desktop([COPY, chord], { sources: ['IBAN'] })
    assert.deepEqual([iban.decision, iban.class], ['confirm', 'sensitive_data'], `${label(chord)} from IBAN`)
  }
})

test('CU-230 desktop: a modified copy chord is not the run\'s copy - when it writes the board, the count outruns the run\'s copies and the paste asks', async () => {
  const [copy, paste] = await desktop([key('META', 'SHIFT', 'C'), PASTE], { sources: ['Notes'] })
  assert.equal(copy.pasteboard, undefined, 'Command-Shift-C is not judged as a copy on the desktop')
  assert.deepEqual([paste.decision, paste.class, paste.pasteboard?.own], ['confirm', 'sensitive_data', false])
})

test('CU-230 browser: Control-Shift-V and Command-Shift-V paste the run clipboard - its value is judged like a typed one', async () => {
  for (const chord of [key('CTRL', 'SHIFT', 'V'), key('META', 'SHIFT', 'V')]) {
    const [card] = await browser([chord], { clip: CARD })
    assert.deepEqual([card.decision, card.class], ['confirm', 'sensitive_data'], `${label(chord)}: a card number`)
    const [plain] = await browser([chord], { clip: 'see you at noon' })
    assert.equal(plain.decision, 'allow', `${label(chord)}: plain text`)
  }
})

test('CU-230 browser: a Control-Shift-C copy from a Password field carries credential to the paste, as Control-C does', async () => {
  for (const chord of [key('CTRL', 'SHIFT', 'C'), key('META', 'SHIFT', 'C'), key('CTRL', 'C')]) {
    const events = await browser([chord, PASTE], { writes: 'opensesame', sources: ['Password'] })
    const paste = events[events.length - 1]
    assert.deepEqual([paste.decision, paste.class], ['confirm', 'credential'], label(chord))
  }
})

test('CU-230: other chords stay what they were - no pasteboard judgement for Command-Shift-Z, Command-B or a bare V', async () => {
  const events = await desktop([key('META', 'SHIFT', 'Z'), key('META', 'B'), key('V')])
  assert.equal(events.length, 3, 'all three were judged')
  assert.ok(events.every((e) => e.pasteboard === undefined), 'none was taken for a copy or a paste')
})
