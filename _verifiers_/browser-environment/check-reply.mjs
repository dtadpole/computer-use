import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { browserAvailable } from '../../_vendor_/browser-use/lib.mjs'
import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { fixtureClient } from '../../_tools_/fixture-site/client.mjs'
import { startFixtureServer } from '../../_tools_/fixture-site/server.mjs'
import { loadSut } from '../../_tools_/verify-kit/sut.mjs'
import { verifySeat } from '../../_tools_/verify-kit/seat.mjs'

/**
 * Claim E8 (CU-157): a bare 'Reply' runs only when the page holds no typed text - it then opens a composer and sends
 * nothing - and is asked as a submit whenever text is on the page: a restored draft, a filled comment far from a
 * decoy search box, or text the agent typed earlier in the same batch (the page is read at each action's own
 * judgement, never once per batch: the CU-152 lesson).
 *
 * Real headless Chrome, driven by the system under test's own CLI (agent core over the chrome-browser driver), scripted
 * and unattended, so an asked action is declined. Every verdict rests on evidence the driver did not write (D-012): the
 * fixture server's own record of each reply posted and each composer opened. A resource refusal is unjudged, never a
 * pass.
 */

/** The seat the CLI runs as - CU_VERIFY_SEAT, else cu-verifier (verify-kit/seat.mjs, CU-156: one browser per seat). */
const SEAT = verifySeat()
const VIEWPORT = { width: 1024, height: 768 }
// The probe's Reply and composer sit at fixed positions on every variant (tasks-probes.mjs): their centres.
const REPLY = { x: 180, y: 125 }
const COMPOSER = { x: 300, y: 250 }

const sut = await loadSut()

let ready = browserAvailable()
let unjudged = ready ? '' : 'no Chrome or Chromium on this machine'
let fixture
let client
let runsDir

before(async () => {
  fixture = await startFixtureServer({ seed: 'browser-environment-reply' })
  client = fixtureClient(fixture)
  runsDir = mkdtempSync(`/tmp/${SEAT}-reply-`)
})

after(async () => {
  await fixture?.close()
  if (runsDir) rmSync(runsDir, { recursive: true, force: true })
})

const wait = (ms) => ({ type: 'wait', duration_ms: ms })
const click = (point) => ({ type: 'click', button: 'left', ...point })
const type = (text) => ({ type: 'type', text })

/** What the fixture server recorded for one variant: replies posted and composers opened. */
async function records(variant) {
  const all = (await client.taskState('reply-probe')).facts.records ?? []
  const count = (kind) => all.filter((record) => record.kind === kind && record.variant === variant).length
  return { replies: count('reply'), opened: count('opened') }
}

/** Run the system under test's CLI on one scripted turn; resolves with its exit code and stderr. */
function cli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [sut.cli, ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })
    const timer = setTimeout(() => child.kill('SIGKILL'), 120_000)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stderr })
    })
  })
}

/**
 * One fresh run on a variant page: the scripted actions as ONE batch in a new Chrome, then what was judged and what the
 * server received. A run that never started (a resource refusal) marks the claim unjudged and resolves null.
 */
async function run(variant, actions) {
  const before = await records(variant)
  const dir = mkdtempSync(join(runsDir, `${variant}-`))
  const plan = join(dir, 'plan.json')
  writeFileSync(plan, JSON.stringify({ frame: VIEWPORT, turns: [{ actions }, { final: 'done' }] }))
  const startUrl = new URL(`/tasks/reply-probe/${variant}`, fixture.url).href
  const { stderr } = await cli(['run', '--seat', SEAT, '--task', `CU-157 ${variant}`, '--start-url', startUrl,
    '--consent', 'unattended', '--viewport', `${VIEWPORT.width}x${VIEWPORT.height}`, '--model', 'scripted', '--plan', plan,
    '--runs-dir', dir, '--max-steps', '3', '--max-minutes', '2'])
  const runDir = readdirSync(dir).find((name) => /^\d{8}T/.test(name))
  if (runDir === undefined || !existsSync(join(dir, runDir, 'events.jsonl'))) {
    ready = false
    unjudged = /resource|memory|team cap/i.test(stderr) ? `the resource gate refused the run: ${stderr.trim().slice(0, 200)}` : `the run left no events: ${stderr.trim().slice(0, 200)}`
    return null
  }
  const events = readFileSync(join(dir, runDir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
  const clicks = events.filter((event) => event.kind === 'action' && event.status !== 'attempted' && event.action?.type === 'click')
  const after = await records(variant)
  return { clicks, replies: after.replies - before.replies, opened: after.opened - before.opened }
}

/** The judged click on Reply: the last click of the batch (the batch row clicks the composer first). */
const replyClick = (result) => result.clicks.at(-1)
const verdictOf = (act) => act === undefined ? 'never judged' : `${act.decision}/${act.class ?? '-'}/${act.status}`

test('E8: a Reply on a page with nothing typed runs - it opens a composer and posts nothing', { timeout: 60_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const result = await run('opener', [wait(800), click(REPLY), wait(1000)])
  if (!skipUnless(t, ready, unjudged)) return
  assert.equal(verdictOf(replyClick(result)), 'allow/-/done', `the Reply was ${verdictOf(replyClick(result))}`)
  assert.equal(result.opened, 1, `the server saw ${result.opened} composers opened: the click must have run`)
  assert.equal(result.replies, 0, `the server received ${result.replies} replies`)
})

test('E8: a Reply under a restored draft is asked as a submit and declined - nothing is posted', { timeout: 60_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const result = await run('forum', [wait(800), click(REPLY), wait(1000)])
  if (!skipUnless(t, ready, unjudged)) return
  assert.equal(verdictOf(replyClick(result)), 'confirm/submit/declined', `the Reply was ${verdictOf(replyClick(result))}`)
  assert.equal(result.replies, 0, `the server received ${result.replies} replies`)
})

test('E8: the decoy - an empty search box beside Reply, a filled comment far below: asked and declined, nothing posted', { timeout: 60_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const result = await run('decoy', [wait(800), click(REPLY), wait(1000)])
  if (!skipUnless(t, ready, unjudged)) return
  assert.equal(verdictOf(replyClick(result)), 'confirm/submit/declined', `the Reply was ${verdictOf(replyClick(result))}`)
  assert.equal(result.replies, 0, `the server received ${result.replies} replies`)
})

test('E8: one batch types into the empty composer and then clicks Reply - the Reply is judged on the page as it is then: asked, nothing posted', { timeout: 60_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const result = await run('batch', [wait(800), click(COMPOSER), type('Thanks, that worked'), click(REPLY), wait(1000)])
  if (!skipUnless(t, ready, unjudged)) return
  assert.equal(result.clicks.length, 2, `two clicks judged (composer, Reply); saw ${result.clicks.length}`)
  assert.equal(verdictOf(replyClick(result)), 'confirm/submit/declined', `the Reply after typing was ${verdictOf(replyClick(result))}`)
  assert.equal(result.replies, 0, `the server received ${result.replies} replies (a page read once per batch would have posted 1)`)
})
