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
// count, so a keystroke copy or paste there could only be judged by the action history. The desktop driver reads the
// count beside the null target (pasteboardChangeCount) - never as a placeholder target, which would change how every
// rule judges a no-focus key - and agent core judges the copy and the paste on it. These rows read what the events
// record (the count, the baseline and by what the paste was judged), so they hold before and after CU-220's fail-closed
// reading of a missing count.

const FIXTURE = 'ai.reflection.cu.fixture'
const frame = { width: 1440, height: 900 }
const COPY = { type: 'keypress', keys: ['META', 'C'] }
const CUT = { type: 'keypress', keys: ['META', 'X'] }
const PASTE = { type: 'keypress', keys: ['META', 'V'] }
const FIELD = { origin: FIXTURE, role: 'AXTextField', name: 'Message', editable: true, fingerprint: 'm' }
const copies = (log) => log.filter((a) => a.type === 'keypress' && a.keys.includes('META') && (a.keys.includes('C') || a.keys.includes('X'))).length

/**
 * One desktop run of `actions` in one turn. `focused(log)` is the focused target (null: nothing focused); `count(log)` the
 * pasteboard's change count; `read` the driver's side read - true for one that returns `count`, false for none (an
 * environment without it), or a function. Returns the action events, one per step and index, and the side reads made.
 */
async function run(actions, { focused = () => null, count = (log) => 41 + copies(log), read = true } = {}) {
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

test('CU-219: Command-C then Command-V with nothing focused, the count risen by that copy - the paste is the run\'s own, judged on the count; the target stays null', async () => {
  const { events: [copy, paste], reads } = await run([COPY, PASTE])
  assert.deepEqual(copy.pasteboard, { kind: 'copy', count: 41 }, 'the copy records the count read beside the null target')
  assert.deepEqual(paste.pasteboard, { kind: 'paste', count: 42, baseline: 41, copies: 1, own: true, by: 'count' })
  assert.equal(paste.decision, 'allow')
  assert.deepEqual([copy.target, paste.target], [undefined, undefined], 'no placeholder target: the events name none')
  assert.deepEqual(reads, [0, 1], 'one side read per key, before each runs')
})

test('CU-219: Command-X counts as a copy too', async () => {
  const { events: [, paste] } = await run([CUT, PASTE])
  assert.deepEqual(paste.pasteboard, { kind: 'paste', count: 42, baseline: 41, copies: 1, own: true, by: 'count' })
})

test('CU-219: with nothing focused, a rise the run did not make, or none at all, makes the paste the owner\'s - it asks', async () => {
  const other = await run([COPY, PASTE], { count: (log) => 41 + 2 * copies(log) })
  assert.deepEqual(other.events[1].pasteboard, { kind: 'paste', count: 43, baseline: 41, copies: 1, own: false, by: 'count' })
  assert.deepEqual([other.events[1].decision, other.events[1].class], ['confirm', 'sensitive_data'], 'the owner copied in between')
  const none = await run([COPY, PASTE], { count: () => 41 })
  assert.deepEqual([none.events[1].pasteboard.own, none.events[1].pasteboard.by, none.events[1].class], [false, 'count', 'sensitive_data'], 'the copy raised nothing')
  const alone = await run([PASTE])
  assert.deepEqual([alone.events[0].pasteboard.own, alone.events[0].class], [false, 'sensitive_data'], 'no own copy before it')
})

test('CU-219: a copy made with nothing focused, pasted into a focused field - the baseline came from the side read', async () => {
  const { events: [, paste], reads } = await run([COPY, PASTE], { focused: (log) => (copies(log) === 0 ? null : FIELD) })
  assert.deepEqual(paste.pasteboard, { kind: 'paste', count: 42, baseline: 41, copies: 1, own: true, by: 'count' })
  assert.equal(paste.decision, 'allow')
  assert.deepEqual(reads, [0], 'only the copy, whose target was null, read beside it')
})

test('CU-219: a copy in a focused field, pasted with nothing focused - the paste is judged on the side read', async () => {
  const { events: [copy, paste], reads } = await run([COPY, PASTE], { focused: (log) => (copies(log) === 0 ? FIELD : null) })
  assert.deepEqual(copy.pasteboard, { kind: 'copy', count: 41 })
  assert.deepEqual(paste.pasteboard, { kind: 'paste', count: 42, baseline: 41, copies: 1, own: true, by: 'count' })
  assert.deepEqual(reads, [1], 'only the paste read beside its null target')
})

test('CU-219: the side read is only for a key copy, cut or paste with a null target - never for other keys, typing, or a target that carries its own count', async () => {
  const others = await run([{ type: 'keypress', keys: ['META', 'A'] }, { type: 'keypress', keys: ['ENTER'] }, { type: 'type', text: 'hello' }, { type: 'keypress', keys: ['V'] }])
  assert.equal(others.events.length, 4, 'all four were judged')
  assert.deepEqual(others.reads, [], 'Command-A, Return, typing and a bare V read nothing beside')
  assert.ok(others.events.every((e) => e.pasteboard === undefined), 'and record no pasteboard judgement')
  const focusedRun = await run([COPY, PASTE], { focused: () => FIELD, read: () => 999 })
  assert.deepEqual(focusedRun.reads, [], 'a focused target carries its own count')
  assert.deepEqual(focusedRun.events[1].pasteboard, { kind: 'paste', count: 42, baseline: 41, copies: 1, own: true, by: 'count' }, 'and that count is the one judged')
})

test('CU-219: without the side read, or when it fails or answers no count, the count stays null - the reading before CU-219', async () => {
  for (const [label, read] of [['no read', false], ['a failed read', () => { throw new Error('helper lost') }], ['no count', () => null], ['malformed', () => -1]]) {
    const { events: [copy, paste] } = await run([COPY, PASTE], { read })
    assert.deepEqual(copy.pasteboard, { kind: 'copy', count: null }, label)
    assert.deepEqual([paste.pasteboard.count, paste.pasteboard.baseline, paste.pasteboard.by], [null, null, 'history'], label)
  }
})
