import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { CARD, IBAN_DE } from '../fixture-shapes/shapes.mjs'

// CU-198 (drag-text.md): a drag that moves text onto a text entry is judged as a paste there - the dragged text's value
// rules and the drop target's name rules; an unknown read asks; any other drag adds nothing.
const policy = createPolicy({ sitePolicy: () => 'allow' })
const DRAG = { type: 'drag', path: [{ x: 1, y: 1 }, { x: 50, y: 50 }] }
const PARAGRAPH = { role: 'StaticText', name: 'shown words' }
const ENTRY = { role: 'textbox', name: '', editable: true }
const verdict = (target, dropTarget, extra = {}, url = 'https://other.example/form') => {
  const r = policy.classify(DRAG, { url, target, dropTarget, ...extra })
  return r.decision === 'allow' ? 'allow' : r.decision === 'handoff' ? 'handoff' : r.class
}

test('CU-198 browser: the dragged text meets the value rules at an entry drop', () => {
  assert.equal(verdict(PARAGRAPH, ENTRY, { dragText: CARD }), 'sensitive_data', 'an uncaptioned card number')
  assert.equal(verdict(PARAGRAPH, ENTRY, { dragText: 'see you at noon' }), 'allow', 'neutral words')
  assert.equal(verdict(PARAGRAPH, ENTRY, { dragText: { unknown: true } }), 'sensitive_data', 'a failed read asks')
  assert.equal(verdict(PARAGRAPH, ENTRY, { dragText: null }), 'allow', 'nothing selected under the press: the drag selects')
  assert.equal(verdict(PARAGRAPH, { role: 'generic', name: '' }, { dragText: CARD }), 'allow', 'a drop off an entry inserts nothing')
})

test('CU-198: the drop target\'s name rules apply to a drag that moves text - browser read, or a desktop press on an entry', () => {
  assert.equal(verdict(PARAGRAPH, { role: 'textbox', name: 'Password', editable: true }, { dragText: 'hello' }), 'credential')
  const notes = { role: 'AXTextField', name: 'Notes', editable: true, fingerprint: 'n' }
  assert.equal(verdict(notes, { role: 'AXTextField', name: 'IBAN', editable: true, fingerprint: 'i' }, {}, 'app://ai.reflection.cu.fixture'), 'sensitive_data', 'desktop: no read, the name rules alone')
  assert.equal(verdict(notes, { role: 'AXTextField', name: 'Comments', editable: true, fingerprint: 'c' }, {}, 'app://ai.reflection.cu.fixture'), 'allow')
})

test('CU-198 guard: a drag that moves no text adds nothing, and a drop back in the pressed entry is a reorder', () => {
  const iban = { role: 'AXTextField', name: 'IBAN', editable: true, fingerprint: 'i' }
  assert.equal(verdict({ role: 'AXSlider', name: 'Volume' }, iban, {}, 'app://ai.reflection.cu.fixture'), 'allow', 'a slider ending over IBAN')
  assert.equal(verdict(iban, iban, {}, 'app://ai.reflection.cu.fixture'), 'allow', 'a drop back inside the pressed IBAN entry is a reorder, not a paste')
})

async function browserRun(dropTarget, dragText) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-198-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: 'http://127.0.0.1:43117/tasks/profile/', control })
    let reads = 0
    environment.inspectPoint = async (point) => (point.x === 1 ? { role: 'StaticText', name: 'shown words' } : dropTarget)
    environment.dragText = async () => { reads += 1; return dragText }
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions: [DRAG] }, { final: 'done' }] })
    const result = await runTask({ task: 'tidy the form', environment, model, sitePolicy: createSitePolicy({ startUrl: 'http://127.0.0.1:43117/tasks/profile/' }), control, runsDirectory: join(dir, 'runs'), build: { commit: 't', dirty: false } })
    const files = readdirSync(result.trajectoryDir, { recursive: true }).filter((f) => typeof f === 'string')
    const written = files.map((f) => { try { return readFileSync(join(result.trajectoryDir, f), 'utf8') } catch { return '' } }).join('\n')
    const events = readFileSync(join(result.trajectoryDir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    const drag = events.filter((e) => e.kind === 'action' && e.action?.type === 'drag').at(-1)
    return { reads, written, decision: drag?.decision, cls: drag?.class ?? null }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

test('CU-198 loop: the browser reads the dragged text only for an entry drop, and never writes it to the run', async () => {
  const onEntry = await browserRun(ENTRY, IBAN_DE)
  assert.equal(onEntry.reads, 1, 'read once at an entry drop')
  assert.equal(onEntry.written.includes('DE89 3704'), false, 'the dragged text is in no run file')
  // The read reaches the policy: the IBAN value asks at the unnamed entry (the paragraph source names nothing).
  assert.deepEqual([onEntry.decision, onEntry.cls], ['confirm', 'sensitive_data'], 'the loop passes the dragged text to the verdict')
  const offEntry = await browserRun({ role: 'generic', name: '' }, IBAN_DE)
  assert.equal(offEntry.reads, 0, 'no read when the drop cannot take text')
  assert.equal(offEntry.decision, 'allow', 'a drop that cannot take text adds nothing')
})
