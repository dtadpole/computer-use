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
 * Claim E6 (CU-153): a reload, back or forward onto a page that was the direct answer to a form POST would re-send the
 * form, so it is asked as the submit it repeats; a page reached by post-redirect-get reloads freely. The mouse's back and
 * forward buttons are the same moves (CU-158).
 *
 * Real headless Chrome, driven by the system under test's own CLI (agent core over the chrome-browser driver), scripted
 * and unattended, so an asked action is declined. Every verdict rests on evidence the driver did not write (D-012):
 * the fixture server's own record of each POST it received. The claim is repeated on fresh pages, because the defect
 * it pins was a race (right at Page.frameNavigated Chrome can still report the previous history entry as current): one
 * pass proves little, and one miss in any repeat fails the claim. A resource refusal is unjudged, never a pass.
 */

/** Repeats: reload right after the POST, and forward onto the answer; cu-verifier asked for at least 3 and 2. */
export const RELOAD_RUNS = 3
export const FORWARD_RUNS = 2
/** CU-158: the mouse's back and forward buttons, as many fresh runs as the forward chord. */
export const MOUSE_RUNS = 2

/** The seat the CLI runs as - CU_VERIFY_SEAT, else cu-verifier (verify-kit/seat.mjs, CU-156: one browser per seat). */
const SEAT = verifySeat()
const VIEWPORT = { width: 1024, height: 768 }
// The probe's buttons sit at fixed positions (tasks-probes.mjs): their centres.
const DIRECT = { x: 200, y: 180 }
const REDIRECTED = { x: 500, y: 180 }

const sut = await loadSut()

let ready = browserAvailable()
let unjudged = ready ? '' : 'no Chrome or Chromium on this machine'
let fixture
let client
let startUrl
let runsDir

before(async () => {
  fixture = await startFixtureServer({ seed: 'browser-environment-resubmit' })
  client = fixtureClient(fixture)
  startUrl = new URL('/tasks/resubmit-probe/', fixture.url).href
  runsDir = mkdtempSync(`/tmp/${SEAT}-resubmit-`)
})

after(async () => {
  await fixture?.close()
  if (runsDir) rmSync(runsDir, { recursive: true, force: true })
})

const wait = (ms) => ({ type: 'wait', duration_ms: ms })
const click = (point) => ({ type: 'click', button: 'left', ...point })
/** CU-158: a click with the mouse's back or forward button, on empty space of the page. */
const mouseButton = (button) => ({ type: 'click', button, x: 700, y: 600 })
const keys = (...names) => ({ type: 'keypress', keys: names })

/** The POSTs the fixture server recorded, by route ('direct' or 'redirected'). */
async function posts() {
  const records = (await client.taskState('resubmit-probe')).facts.records ?? []
  const count = (route) => records.filter((record) => record.kind === 'post' && record.route === route).length
  return { direct: count('direct'), redirected: count('redirected') }
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
 * One fresh run: the scripted actions in a new Chrome on the probe, then what was judged and what the server received.
 * A run that never started (a resource refusal) marks the claim unjudged and resolves null.
 */
async function run(label, actions) {
  const before = await posts()
  const dir = mkdtempSync(join(runsDir, 'run-'))
  const plan = join(dir, 'plan.json')
  writeFileSync(plan, JSON.stringify({ frame: VIEWPORT, turns: [{ actions }, { final: 'done' }] }))
  const { stderr } = await cli(['run', '--seat', SEAT, '--task', `CU-153 ${label}`, '--start-url', startUrl,
    '--consent', 'unattended', '--viewport', `${VIEWPORT.width}x${VIEWPORT.height}`, '--model', 'scripted', '--plan', plan,
    '--runs-dir', dir, '--max-steps', '3', '--max-minutes', '2'])
  const runDir = readdirSync(dir).find((name) => /^\d{8}T/.test(name))
  if (runDir === undefined) {
    ready = false
    unjudged = /resource|memory|team cap/i.test(stderr) ? `the resource gate refused the run: ${stderr.trim().slice(0, 200)}` : `the run did not start: ${stderr.trim().slice(0, 200)}`
    return null
  }
  // A run refused inside the CLI (the resource gate: one browser per seat, D-005) leaves a run folder with no events:
  // unjudged, never a fail - a refusal is not the defect, and must not count as catching a mutant either.
  if (!existsSync(join(dir, runDir, 'events.jsonl'))) {
    let reason = 'the run left no events'
    try {
      const result = JSON.parse(readFileSync(join(dir, runDir, 'run.json'), 'utf8')).result
      reason = `the run left no events (${result?.status ?? 'no status'}${result?.code ? `, ${result.code}` : ''}: ${String(result?.message ?? '').slice(0, 160)})`
    } catch {
      // no run.json either: the reason above stands
    }
    ready = false
    unjudged = reason
    return null
  }
  const events = readFileSync(join(dir, runDir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
  const acts = events.filter((event) => event.kind === 'action' && event.status !== 'attempted' && event.action?.type !== 'wait')
  const after = await posts()
  return { acts, direct: after.direct - before.direct, redirected: after.redirected - before.redirected }
}

/** The n-th judged click of a run (1-based). */
const clickAt = (result, n) => result.acts.filter((act) => act.action?.type === 'click')[n - 1]
/** The n-th judged keypress of a run (1-based): the plan's order, since an event records the keys canonically ('[' for BRACKETLEFT). */
const keypress = (result, n) => result.acts.filter((act) => act.action?.type === 'keypress')[n - 1]
const verdictOf = (act) => act === undefined ? 'never judged' : `${act.decision}/${act.class ?? '-'}/${act.status}`

test(`E6: a reload right after a POST answered 200 is asked as the submit it repeats and declined - ${RELOAD_RUNS} fresh runs, one POST each`, { timeout: 60_000 * RELOAD_RUNS }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  for (let index = 1; index <= RELOAD_RUNS; index++) {
    const result = await run(`reload ${index}`, [wait(800), click(DIRECT), wait(1200), keys('META', 'R'), wait(1500)])
    if (!skipUnless(t, ready, unjudged)) return
    const reload = keypress(result, 1)
    assert.equal(verdictOf(reload), 'confirm/submit/declined', `run ${index}: the reload was ${verdictOf(reload)}`)
    assert.equal(result.direct, 1, `run ${index}: the server received ${result.direct} POSTs (a re-sent form shows as 2)`)
  }
})

test(`E6: back to the form is free, and forward onto the POST's answer is asked and declined - ${FORWARD_RUNS} fresh runs, one POST each`, { timeout: 60_000 * FORWARD_RUNS }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  for (let index = 1; index <= FORWARD_RUNS; index++) {
    const result = await run(`forward ${index}`, [wait(800), click(DIRECT), wait(1200), keys('META', 'BRACKETLEFT'), wait(1500), keys('META', 'BRACKETRIGHT'), wait(1500)])
    if (!skipUnless(t, ready, unjudged)) return
    const back = keypress(result, 1)
    const forward = keypress(result, 2)
    assert.equal(verdictOf(back), 'allow/-/done', `run ${index}: back onto the form was ${verdictOf(back)}`)
    assert.equal(verdictOf(forward), 'confirm/submit/declined', `run ${index}: forward onto the answer was ${verdictOf(forward)}`)
    assert.equal(result.direct, 1, `run ${index}: the server received ${result.direct} POSTs`)
  }
})

test(`E6 (CU-158): the mouse's back button onto the form is free, and its forward button onto the POST's answer is asked and declined - ${MOUSE_RUNS} fresh runs, one POST each`, { timeout: 60_000 * MOUSE_RUNS }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  for (let index = 1; index <= MOUSE_RUNS; index++) {
    const result = await run(`mouse buttons ${index}`, [wait(800), click(DIRECT), wait(1200), mouseButton('back'), wait(1500), mouseButton('forward'), wait(1500)])
    if (!skipUnless(t, ready, unjudged)) return
    const back = clickAt(result, 2)
    const forward = clickAt(result, 3)
    assert.equal(verdictOf(back), 'allow/-/done', `run ${index}: the back button onto the form was ${verdictOf(back)}`)
    assert.equal(verdictOf(forward), 'confirm/submit/declined', `run ${index}: the forward button onto the answer was ${verdictOf(forward)}`)
    assert.equal(result.direct, 1, `run ${index}: the server received ${result.direct} POSTs`)
  }
})

test('E6 control: a reload after post-redirect-get (303) is allowed - the fix must not over-ask', { timeout: 60_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const result = await run('post-redirect-get control', [wait(800), click(REDIRECTED), wait(1200), keys('META', 'R'), wait(1500)])
  if (!skipUnless(t, ready, unjudged)) return
  const reload = keypress(result, 1)
  assert.equal(verdictOf(reload), 'allow/-/done', `the reload of the redirected page was ${verdictOf(reload)}`)
  assert.equal(result.redirected, 1, `the server received ${result.redirected} POSTs: the reload re-gets, it does not re-post`)
})
