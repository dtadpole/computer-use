import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { browserAvailable } from '../../_vendor_/browser-use/lib.mjs'
import { skipUnless } from '../../_vendor_/browser-use/_tools_/verify-runner/lib.mjs'
import { loadSut } from '../../_tools_/verify-kit/sut.mjs'
import { verifySeat } from '../../_tools_/verify-kit/seat.mjs'

/**
 * Claim E7 (CU-155): one of Chrome's own warning pages - here a certificate warning - is handed to the person, and
 * nothing the agent does next reaches past it.
 *
 * The path is a real one: a run allowed (--allow) onto a second origin served over https with a certificate Chrome does
 * not trust, an internal site's self-signed one. Real headless Chrome, driven by the system under test's own CLI
 * (agent core over the chrome-browser driver), scripted and unattended. Chrome commits the warning as
 * chrome-error://chromewebdata/ while Target.targetInfoChanged puts the attempted URL back, so the URL alone never
 * shows it (the defect CU-155 fixed). The evidence the driver did not write (D-012) is the https server's own count of
 * requests: a TLS failure sends none, and clicking through the warning would. The certificate is minted per run with
 * the system's openssl into a throwaway folder - no key is kept in the tree; without openssl the claim is unjudged.
 */

/** The seat the CLI runs as - CU_VERIFY_SEAT, else cu-verifier (verify-kit/seat.mjs, CU-156: one browser per seat). */
const SEAT = verifySeat()
const VIEWPORT = { width: 1024, height: 768 }
// The start page's link sits at a fixed position: its centre.
const LINK = { x: 250, y: 180 }

const sut = await loadSut()

let ready = browserAvailable()
let unjudged = ready ? '' : 'no Chrome or Chromium on this machine'
let dir
let plain
let secure
let secureRequests = 0

before(async () => {
  dir = mkdtempSync(`/tmp/${SEAT}-interstitial-`)
  const key = join(dir, 'key.pem')
  const cert = join(dir, 'cert.pem')
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '1', '-subj', '/CN=127.0.0.1'], { stdio: 'ignore' })
  } catch {
    ready = false
    unjudged = 'no openssl to mint a throwaway certificate'
    return
  }
  secure = https.createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (request, response) => {
    secureRequests += 1
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end('<!doctype html><title>Internal</title><h1>Reached past the warning</h1>')
  })
  await new Promise((resolve) => secure.listen(0, '127.0.0.1', resolve))
  const target = `https://127.0.0.1:${secure.address().port}/`
  plain = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(`<!doctype html><title>Start</title><main><a id="go" href="${target}" style="position:absolute;left:100px;top:150px;width:300px;height:60px;display:block">Open the internal site</a></main>`)
  })
  await new Promise((resolve) => plain.listen(0, '127.0.0.1', resolve))
})

after(async () => {
  await new Promise((resolve) => (secure ? secure.close(resolve) : resolve()))
  await new Promise((resolve) => (plain ? plain.close(resolve) : resolve()))
  if (dir) rmSync(dir, { recursive: true, force: true })
})

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

test('E7: a certificate warning on an allowed origin is handed to the person - the next action is not performed, and nothing reaches past it', { timeout: 120_000 }, async (t) => {
  if (!skipUnless(t, ready, unjudged)) return
  const start = `http://127.0.0.1:${plain.address().port}/`
  const runs = mkdtempSync(join(dir, 'runs-'))
  const plan = join(runs, 'plan.json')
  const wait = (ms) => ({ type: 'wait', duration_ms: ms })
  const click = (point) => ({ type: 'click', button: 'left', ...point })
  // The link, then a wait and a click where the warning's own buttons sit: whatever comes next must not be performed.
  writeFileSync(plan, JSON.stringify({ frame: VIEWPORT, turns: [{ actions: [wait(800), click(LINK), wait(2000), click({ x: 300, y: 420 }), wait(1000)] }, { final: 'done' }] }))
  const { stderr } = await cli(['run', '--seat', SEAT, '--task', 'CU-155 certificate warning', '--start-url', start,
    '--allow', `http://127.0.0.1:${plain.address().port}`, '--allow', `https://127.0.0.1:${secure.address().port}`,
    '--consent', 'unattended', '--viewport', `${VIEWPORT.width}x${VIEWPORT.height}`, '--model', 'scripted', '--plan', plan,
    '--runs-dir', runs, '--max-steps', '3', '--max-minutes', '2'])
  const runDir = readdirSync(runs).find((name) => /^\d{8}T/.test(name))
  // A run refused at start, or inside the CLI (one browser per seat, D-005), is unjudged - never a fail, never a catch.
  if (runDir === undefined || !existsSync(join(runs, runDir, 'events.jsonl'))) {
    ready = false
    unjudged = `the run did not start or left no events: ${stderr.trim().slice(0, 200)}`
    if (!skipUnless(t, ready, unjudged)) return
  }
  const events = readFileSync(join(runs, runDir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
  // Judged actions in order. Once the warning is up the policy hands off the very next action of any kind - even a wait.
  const acts = events.filter((event) => event.kind === 'action' && event.status !== 'attempted')
  const linkAt = acts.findIndex((act) => act.action?.type === 'click')
  const link = acts[linkAt]
  const next = linkAt < 0 ? undefined : acts[linkAt + 1]
  const verdictOf = (act) => act === undefined ? 'never judged' : `${act.decision}/${act.rule ?? '-'}/${act.status}`
  const trail = events.map((event) => [event.kind, event.action?.type, event.decision, event.rule, event.status, event.reason ?? event.result?.status].filter(Boolean).join(':')).join(' | ').slice(0, 900)
  assert.equal(link?.decision, 'allow', `the link itself is a plain link: ${verdictOf(link)}`)
  assert.equal(`${next?.decision}/${next?.rule}`, 'handoff/interstitial', `the first action on the warning page was ${verdictOf(next)}; events: ${trail}`)
  assert.notEqual(next?.status, 'done', 'a handed-off action is not performed')
  assert.equal(acts.slice(linkAt + 1).some((act) => act.status === 'done'), false, `nothing after the warning was performed; events: ${trail}`)
  assert.equal(secureRequests, 0, `the https server received ${secureRequests} requests: something reached past the warning`)
})
