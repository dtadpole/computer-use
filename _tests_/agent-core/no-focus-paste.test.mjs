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
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-219 (paste-consent.md): with nothing focused the focused target is null, and a null target carries no pasteboard
// count - so under CU-220 a keystroke paste there asked even after the run's own copy, and a copy made there left no
// baseline. The desktop driver reads the count beside the null target (pasteboardChangeCount) - never as a placeholder
// target, which would change how every rule judges a no-focus key - and agent core judges the copy and the paste on
// it; the event says so (countRead 'no-focus').

const FIXTURE = 'ai.reflection.cu.fixture'
const frame = { width: 1440, height: 900 }
const COPY = { type: 'keypress', keys: ['META', 'C'] }
const CUT = { type: 'keypress', keys: ['META', 'X'] }
const PASTE = { type: 'keypress', keys: ['META', 'V'] }
const FIELD = { origin: FIXTURE, role: 'AXTextField', name: 'Message', editable: true, fingerprint: 'm' }
const SCRATCH = { origin: FIXTURE, role: 'AXTextField', name: 'Scratch', editable: true, fingerprint: 's' }
const copies = (log) => log.filter((a) => a.type === 'keypress' && a.keys.includes('META') && (a.keys.includes('C') || a.keys.includes('X'))).length
const SIDE = { countRead: 'no-focus' }

/**
 * One desktop run of `actions` in one turn. `focused(log)` is the focused target (null: nothing focused); `count(log)` the
 * pasteboard's change count; `read` the driver's side read - true for one that returns `count`, false for none (an
 * environment without it), or a function; `caption` makes a static-text selection under that caption the copy's source
 * until the first copy (the driver's selectionSource, CU-187). Returns the action events, one per step and index, and
 * the side reads made (each as the number of actions sent before it).
 */
async function run(actions, { focused = () => null, count = (log) => 41 + copies(log), read = true, caption = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-219-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ kind: 'desktop', control })
    const reads = []
    environment.focusedElement = async () => {
      const target = focused(environment.log)
      return target === null ? null : { ...target, pasteboardChangeCount: count(environment.log) }
    }
    if (read !== false) {
      environment.pasteboardChangeCount = async () => {
        reads.push(environment.log.length)
        return read === true ? count(environment.log) : read(environment.log)
      }
    }
    if (caption !== null) environment.selectionSource = async () => (copies(environment.log) === 0 ? { role: 'AXStaticText', tag: null, origin: FIXTURE, caption } : null)
    const store = createAppApprovals({ path: join(dir, 'a.json') })
    store.grantAlways(FIXTURE, { by: 'api' })
    const model = createScriptedAdapter({ frame, turns: [{ actions }, { final: 'done' }] })
    const result = await runTask({ task: 'reply', environment, model, control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, apps: [FIXTURE], appApprovals: store })
    const events = [...new Map(readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').map((e) => [`${e.step}:${e.index}`, e])).values()]
    return { events, reads }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const verdict = (event) => [event.decision, event.class ?? event.rule]

test('CU-219: Command-C then Command-V with nothing focused, the count risen by that copy - the run\'s own paste, allowed on the count; the target stays null', async () => {
  const { events: [copy, paste], reads } = await run([COPY, PASTE])
  assert.deepEqual(copy.pasteboard, { kind: 'copy', count: 41, ...SIDE }, 'the copy records the count read beside the null target')
  assert.deepEqual(paste.pasteboard, { kind: 'paste', count: 42, baseline: 41, copies: 1, own: true, by: 'count', ...SIDE })
  assert.deepEqual(verdict(paste), ['allow', 'default'])
  assert.deepEqual([copy.target, paste.target], [undefined, undefined], 'no placeholder target: the events name none')
  assert.deepEqual(reads, [0, 1], 'one side read per key, before each runs')
})

test('CU-219: Command-X counts as a copy too, and Control works as Command does', async () => {
  assert.deepEqual((await run([CUT, PASTE])).events[1].pasteboard, { kind: 'paste', count: 42, baseline: 41, copies: 1, own: true, by: 'count', ...SIDE })
  const ctrl = await run([{ type: 'keypress', keys: ['CTRL', 'C'] }, { type: 'keypress', keys: ['CTRL', 'V'] }], { count: (log) => 41 + log.filter((a) => a.keys?.includes('C')).length })
  assert.deepEqual([ctrl.reads, ctrl.events[1].pasteboard.by, ctrl.events[1].decision], [[0, 1], 'count', 'allow'])
})

test('CU-219 with CU-230: every paste chord with nothing focused reads the count beside - Paste and Match Style, Command-Shift-V - and is judged on it', async () => {
  for (const keys of [['META', 'ALT', 'SHIFT', 'V'], ['META', 'SHIFT', 'V']]) {
    const own = await run([COPY, { type: 'keypress', keys }])
    assert.deepEqual(own.events[1].pasteboard, { kind: 'paste', count: 42, baseline: 41, copies: 1, own: true, by: 'count', ...SIDE }, keys.join('+'))
    assert.deepEqual(verdict(own.events[1]), ['allow', 'default'], keys.join('+'))
    const foreign = await run([COPY, { type: 'keypress', keys }], { count: (log) => 41 + 2 * copies(log) })
    assert.deepEqual(verdict(foreign.events[1]), ['confirm', 'sensitive_data'], `${keys.join('+')}: a rise the run did not make`)
  }
})

test('CU-219: with nothing focused, a rise the run did not make, none at all, or no own copy - the paste is the owner\'s and asks', async () => {
  const other = await run([COPY, PASTE], { count: (log) => 41 + 2 * copies(log) })
  assert.deepEqual(other.events[1].pasteboard, { kind: 'paste', count: 43, baseline: 41, copies: 1, own: false, by: 'count', ...SIDE })
  assert.deepEqual(verdict(other.events[1]), ['confirm', 'sensitive_data'], 'the owner copied in between')
  const none = await run([COPY, PASTE], { count: () => 41 })
  assert.deepEqual([none.events[1].pasteboard.own, none.events[1].pasteboard.by, none.events[1].class], [false, 'count', 'sensitive_data'], 'the copy raised nothing')
  const alone = await run([PASTE])
  assert.deepEqual([alone.events[0].pasteboard.own, alone.events[0].class], [false, 'sensitive_data'], 'no own copy before it')
})

test('CU-219: a copy made with nothing focused, pasted into a focused field - the baseline came from the side read', async () => {
  const { events: [copy, paste], reads } = await run([COPY, PASTE], { focused: (log) => (copies(log) === 0 ? null : FIELD) })
  assert.deepEqual(copy.pasteboard, { kind: 'copy', count: 41, ...SIDE })
  assert.deepEqual(paste.pasteboard, { kind: 'paste', count: 42, baseline: 41, copies: 1, own: true, by: 'count' }, 'the paste\'s own target carried its count')
  assert.deepEqual(verdict(paste), ['allow', 'default'])
  assert.deepEqual(reads, [0], 'only the copy, whose target was null, read beside it')
})

test('CU-219: a copy in a focused field, pasted with nothing focused - the paste is judged on the side read', async () => {
  const { events: [copy, paste], reads } = await run([COPY, PASTE], { focused: (log) => (copies(log) === 0 ? FIELD : null) })
  assert.deepEqual(copy.pasteboard, { kind: 'copy', count: 41 })
  assert.deepEqual(paste.pasteboard, { kind: 'paste', count: 42, baseline: 41, copies: 1, own: true, by: 'count', ...SIDE })
  assert.deepEqual(verdict(paste), ['allow', 'default'])
  assert.deepEqual(reads, [1], 'only the paste read beside its null target')
})

test('CU-219 with CU-187 (cu-verifier\'s L2 shape): selected text copied with nothing focused takes its source from the selection and its baseline from the side read - captioned Vendor it pastes into an entry unasked, captioned IBAN it asks', async () => {
  const into = (log) => (copies(log) === 0 ? null : SCRATCH)
  const vendor = await run([COPY, PASTE], { focused: into, caption: 'Vendor' })
  assert.deepEqual(vendor.events[1].pasteboard, { kind: 'paste', count: 42, baseline: 41, copies: 1, own: true, by: 'count' })
  assert.deepEqual(verdict(vendor.events[1]), ['allow', 'default'], 'Vendor: the run\'s own harmless text')
  const iban = await run([COPY, PASTE], { focused: into, caption: 'IBAN' })
  assert.equal(iban.events[1].pasteboard.own, true, 'the run\'s own copy, proven by the count')
  assert.deepEqual(verdict(iban.events[1]), ['confirm', 'sensitive_data'], 'IBAN: the source\'s class travels to the paste')
})

test('CU-219: a no-focus paste of an IBAN-captioned own copy still asks by its source - no destination is needed for that', async () => {
  const { events: [, paste] } = await run([COPY, PASTE], { caption: 'IBAN' })
  assert.deepEqual(paste.pasteboard, { kind: 'paste', count: 42, baseline: 41, copies: 1, own: true, by: 'count', ...SIDE })
  assert.deepEqual(verdict(paste), ['confirm', 'sensitive_data'])
})

test('CU-219: the side read is only for a key copy, cut or paste with a null target - never for other keys, typing, or a target that carries its own count', async () => {
  const others = await run([{ type: 'keypress', keys: ['META', 'A'] }, { type: 'keypress', keys: ['ENTER'] }, { type: 'type', text: 'hello' }, { type: 'keypress', keys: ['V'] }])
  assert.equal(others.events.length, 4, 'all four were judged')
  assert.deepEqual(others.reads, [], 'Command-A, Return, typing and a bare V read nothing beside')
  assert.ok(others.events.every((e) => e.pasteboard === undefined), 'and record no pasteboard judgement')
  const focusedRun = await run([COPY, PASTE], { focused: () => FIELD, read: () => 999 })
  assert.deepEqual(focusedRun.reads, [], 'a focused target carries its own count')
  assert.deepEqual(focusedRun.events[1].pasteboard, { kind: 'paste', count: 42, baseline: 41, copies: 1, own: true, by: 'count' }, 'and that count is the one judged; no countRead')
})

test('CU-219: a side read that fails or answers no count leaves the count null - the paste asks (CU-220); with no side read at all, as before CU-219', async () => {
  for (const [label, read] of [['a failed read', () => { throw new Error('helper lost') }], ['no count', () => null], ['malformed', () => -1], ['a string', () => '42']]) {
    const { events: [copy, paste] } = await run([COPY, PASTE], { read })
    assert.deepEqual(copy.pasteboard, { kind: 'copy', count: null, ...SIDE }, label)
    assert.deepEqual([paste.pasteboard.count, paste.pasteboard.own, paste.pasteboard.countRead], [null, false, 'no-focus'], label)
    assert.deepEqual(verdict(paste), ['confirm', 'sensitive_data'], label)
  }
  const { events: [copy, paste] } = await run([COPY, PASTE], { read: false })
  assert.deepEqual(copy.pasteboard, { kind: 'copy', count: null }, 'no side read: no countRead')
  assert.deepEqual([paste.pasteboard.count, paste.pasteboard.own, paste.pasteboard.countRead], [null, false, undefined])
  assert.deepEqual(verdict(paste), ['confirm', 'sensitive_data'], 'CU-220: no count, the owner\'s')
})
