import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { createScriptedAdapter } from '../../_tools_/agent-core/adapter-scripted.mjs'
import { createRunControl } from '../../_tools_/agent-core/control.mjs'
import { createFakeEnvironment } from '../../_tools_/agent-core/fake-env.mjs'
import { runTask } from '../../_tools_/agent-core/loop.mjs'
import { createPolicy } from '../../_tools_/agent-core/policy.mjs'
import { createSitePolicy } from '../../_tools_/agent-core/sites.mjs'
import { readRun } from '../../_tools_/agent-core/trajectory.mjs'

// CU-157 (reply-text-entered.md): a control whose only submit word is 'reply' asks only when some text entry on its
// page or window holds text - target.textEntered, read at each action's own judgement; only a strict false runs.

const START = 'http://127.0.0.1:43117/tasks/demo/'
const ORIGIN = 'http://127.0.0.1:43117'
const CLICK = { type: 'click', x: 100, y: 200, button: 'left' }
const policy = createPolicy({ sitePolicy: createSitePolicy({ startUrl: START }) })
const at = (fields) => ({ url: START, target: { tag: 'button', role: 'button', origin: ORIGIN, fingerprint: 'b', ...fields } })
const judge = (fields, action = CLICK) => policy.classify(action, at(fields))

test('a Reply runs only when no text is entered (strict false); true, null or absent asks submit', () => {
  for (const name of ['Reply in thread', 'Reply all', 'Reply to all', 'Reply']) assert.equal(judge({ name, textEntered: false }).decision, 'allow', name)
  for (const textEntered of [true, null, undefined, 0, 'false']) {
    const v = judge({ name: 'Reply', ...(textEntered === undefined ? {} : { textEntered }) })
    assert.deepEqual([v.decision, v.class], ['confirm', 'submit'], String(textEntered))
  }
})

test('another submit word decides as today, and other classes are untouched, whatever textEntered says', () => {
  for (const name of ['Send reply', 'Post reply', 'Reply and submit']) assert.equal(judge({ name, textEntered: false }).class, 'submit', name)
  assert.equal(judge({ name: 'Reply and delete', textEntered: false }).class, 'delete')
  assert.equal(judge({ name: 'Send', textEntered: false }).class, 'submit')
})

test('a Return pressing a default button named Reply follows the same rule', () => {
  const RETURN = { type: 'keypress', keys: ['RETURN'] }
  const field = { tag: 'input', role: 'textbox', name: 'Search', defaultButton: { name: 'Reply' } }
  assert.equal(judge({ ...field, textEntered: false }, RETURN).decision, 'allow')
  assert.equal(judge({ ...field, textEntered: true }, RETURN).class, 'submit')
})

async function batch(actions, entered) {
  const dir = mkdtempSync(join(tmpdir(), 'cu-reply-'))
  try {
    const control = createRunControl()
    const environment = createFakeEnvironment({ url: START, control })
    // The page holds text once the run has typed: the environment's report changes between actions in one batch.
    environment.inspectPoint = async () => ({ tag: 'button', role: 'button', name: 'Reply', origin: ORIGIN, fingerprint: 'r', textEntered: entered(environment.log) })
    environment.focusedElement = async () => ({ tag: 'textarea', role: 'textbox', name: 'Comment', origin: ORIGIN, fingerprint: 'c', textEntered: entered(environment.log) })
    const model = createScriptedAdapter({ frame: { width: 1440, height: 900 }, turns: [{ actions }, { final: 'done' }] })
    const result = await runTask({ task: 'reply to the thread', environment, model, sitePolicy: createSitePolicy({ startUrl: START }), control, runsDirectory: join(dir, 'runs'), build: { commit: 'test', dirty: false }, consent: 'unattended' })
    const events = [...new Map(readRun(result.trajectoryDir).events.filter((e) => e.kind === 'action').map((e) => [`${e.step}:${e.index}`, e])).values()]
    return { events, clicks: environment.log.filter((a) => a.type === 'click').length }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('through the loop: a Reply that only opens a composer runs, and its event records textEntered false', async () => {
  const { events, clicks } = await batch([CLICK], () => false)
  assert.deepEqual([events[0].decision, events[0].textEntered], ['allow', false])
  assert.equal(clicks, 1)
})

test('one batch typing into the composer, then clicking Reply: the click is judged on the text now entered - asked, not performed', async () => {
  const typed = (log) => log.some((a) => a.type === 'type')
  const { events, clicks } = await batch([{ type: 'type', text: 'Thanks, agreed.' }, CLICK], typed)
  const click = events.find((e) => e.action?.type === 'click')
  assert.deepEqual([click.decision, click.class, click.textEntered], ['confirm', 'submit', true])
  assert.equal(clicks, 0, 'declined unattended: the Reply never ran')
})
