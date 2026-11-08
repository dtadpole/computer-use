/**
 * The harness side of CU Fixture's control channel: launch the app as a child process and speak JSON lines on its
 * stdin and stdout. Only the process that launched the app holds this channel, so an agent driving the screen cannot
 * read the facts it returns (D-012).
 */

import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'

/** Split a stream into whole JSON lines; returns `push(chunk) -> messages`. */
export function jsonLines() {
  let buffer = ''
  return (chunk) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop()
    return lines.filter((line) => line.trim() !== '').map((line) => JSON.parse(line))
  }
}

/**
 * Launch the fixture. `offscreen` keeps every window unshown (self-tests); `sandbox` is the run's file area (made
 * under /tmp when omitted). Resolves to `{ call(method, params), open, state, act, targets, render, close, sandbox,
 * child }`.
 */
export async function launchFixture(executable, { offscreen = true, sandbox = mkdtempSync('/tmp/cu-fixture-sandbox-'), role = 'fixture', timeoutMs = 10_000 } = {}) {
  const args = ['--sandbox', sandbox, '--role', role, ...(offscreen ? ['--offscreen'] : [])]
  const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'] })
  const pending = new Map()
  let nextId = 1
  let stderr = ''
  const read = jsonLines()
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    for (const message of read(chunk)) {
      const waiter = pending.get(message.id)
      if (!waiter) continue
      pending.delete(message.id)
      clearTimeout(waiter.timer)
      if (message.error) waiter.reject(Object.assign(new Error(message.error), { code: 'fixture_error' }))
      else waiter.resolve(message.result)
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-4000)))
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })))
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      if (child.exitCode !== null) return reject(new Error(`the fixture has exited: ${stderr.slice(-300)}`))
      const id = nextId++
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`fixture ${method} got no answer within ${timeoutMs} ms`))
      }, timeoutMs)
      pending.set(id, { resolve, reject, timer })
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
    })
  const hello = await call('hello')
  return {
    child,
    sandbox,
    hello,
    exited,
    stderr: () => stderr,
    call,
    reset: () => call('reset'),
    open: (task, params) => call('open', { task, params }),
    state: () => call('state'),
    act: (step) => call('act', step),
    targets: () => call('targets'),
    /** What Accessibility reports at each target's centre: role, name and the element's class (CU-137). */
    axAudit: () => call('axAudit'),
    render: (window, path) => call('render', { window, path }),
    /** Quit, then make sure: SIGTERM after 3 s, SIGKILL after 6 s. */
    async close() {
      if (child.exitCode !== null) return exited
      call('quit').catch(() => {})
      child.stdin.end()
      const timers = [setTimeout(() => child.kill('SIGTERM'), 3000), setTimeout(() => child.kill('SIGKILL'), 6000)]
      const result = await exited
      timers.forEach(clearTimeout)
      return result
    },
  }
}
