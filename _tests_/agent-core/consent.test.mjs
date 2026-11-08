import assert from 'node:assert/strict'
import { test } from 'node:test'


test('tty consent reads only a real terminal: a piped y never approves (red team C1)', async () => {
  const { PassThrough } = await import('node:stream')
  const { ttyController } = await import('../../_tools_/agent-core/consent.mjs')
  const { createRunControl } = await import('../../_tools_/agent-core/control.mjs')
  // A pipe (not a TTY) is refused: the controller declines everything instead of reading it.
  const pipe = new PassThrough()
  const piped = ttyController({ input: pipe, output: new PassThrough() })
  assert.equal(piped.kind, 'tty_unavailable')
  const control = createRunControl()
  const detach = piped.attach(control)
  const answer = control.requestConsent({ id: 'c1', class: 'new_app' })
  pipe.write('y\n')
  assert.equal((await answer).approved, false)
  detach?.()
  // No controlling terminal at all: declines too.
  assert.equal(ttyController({ terminal: null }).kind, 'tty_unavailable')
  // A real terminal (marked TTY) still works.
  const term = new PassThrough(); term.isTTY = true
  const live = ttyController({ input: term, output: new PassThrough() })
  const control2 = createRunControl()
  const detach2 = live.attach(control2)
  const answer2 = control2.requestConsent({ id: 'c2', class: 'new_app' })
  term.write('y\n')
  assert.equal((await answer2).approved, true)
  detach2()
})

test('cli refuses --consent tty without an interactive terminal', async () => {
  const { spawnSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')
  const cli = fileURLToPath(new URL('../../_tools_/agent-core/cli.mjs', import.meta.url))
  const run = spawnSync(process.execPath, [cli, 'run', '--task', 't', '--start-url', 'http://127.0.0.1:1/', '--seat', 'cu-developer-one', '--consent', 'tty'], { encoding: 'utf8', input: 'y\ny\n', env: { PATH: process.env.PATH } })
  assert.equal(run.status, 64, run.stderr)
  assert.match(run.stderr, /interactive terminal/)
})

test('tty consent answers any lifetime the question offers, one key each; an unoffered key declines', async () => {
  const { PassThrough } = await import('node:stream')
  const { ttyController } = await import('../../_tools_/agent-core/consent.mjs')
  const { createRunControl } = await import('../../_tools_/agent-core/control.mjs')
  const ask = async (lifetimes, key) => {
    const term = new PassThrough(); term.isTTY = true
    const out = new PassThrough(); let shown = ''
    out.on('data', (chunk) => { shown += chunk })
    const control = createRunControl()
    const detach = ttyController({ input: term, output: out }).attach(control)
    const answer = control.requestConsent({ id: `c-${key}`, class: 'new_app', lifetimes })
    term.write(`${key}\n`)
    const result = await answer
    detach()
    return { result, shown }
  }
  const always = await ask(['once', 'run', 'always'], 'a')
  assert.deepEqual([always.result.approved, always.result.lifetime], [true, 'always'])
  assert.match(always.shown, /y=once, r=run, a=always/)
  const run = await ask(['once', 'run', 'always'], 'r')
  assert.deepEqual([run.result.approved, run.result.lifetime], [true, 'run'])
  assert.equal((await ask(['once', 'batch', 'run'], 'a')).result.approved, false, 'always is not offered here')
  assert.equal((await ask(undefined, 'y')).result.approved, true, 'no lifetimes means once')
  assert.equal((await ask(['once'], 'n')).result.approved, false)
})

