/**
 * A judge-side client for the desktop helper protocol (desktop-extension 0.2, helper-and-protocol.md): one JSON object
 * per line each way; the helper's first line is `hello`; requests carry `id` and replies echo it as
 * `{ id, ok: true, ... }` or `{ id, ok: false, code, message }`; events are `{ event: 'frame' | 'localInput', ... }`.
 * It speaks to cu-developer-two's fake helper and to the Swift helper alike, and imports neither (D-012).
 */

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { join } from 'node:path'

/** The key that names a request on the wire (to be confirmed with cu-developer-two; one constant to change). */
export const REQUEST_KEY = 'type'

/** The protocol's reply codes (helper-and-protocol.md). */
export const CODES = Object.freeze(['not_granted', 'no_scope', 'out_of_scope', 'excluded', 'pause_not_armed', 'local_input', 'unknown_request', 'unknown_field', 'invalid_argument', 'unsupported', 'timeout', 'failed'])

/** True when a line is the helper's opening hello, whichever way the wire spells it. */
export const isHello = (line) => line?.[REQUEST_KEY] === 'hello' || line?.event === 'hello' || line?.hello !== undefined || (line?.protocol !== undefined && line?.grants !== undefined)

/** The hello fields, wherever the wire nests them. */
export const helloFields = (line) => (line?.hello && typeof line.hello === 'object' ? line.hello : line)

/**
 * Speak the protocol over a readable and a writable stream (stdio or a socket). Resolves once the hello has arrived.
 */
async function attach({ readable, writable, child, helloTimeoutMs, stderrOf }) {
  const pending = new Map()
  const events = []
  const listeners = new Set()
  let nextId = 1
  let buffer = ''
  let resolveHello
  let rejectHello
  const helloPromise = new Promise((resolve, reject) => {
    resolveHello = resolve
    rejectHello = reject
  })
  const helloTimer = setTimeout(() => rejectHello(new Error(`no hello within ${helloTimeoutMs} ms: ${stderrOf().slice(-200)}`)), helloTimeoutMs)
  let first = true
  readable.setEncoding('utf8')
  readable.on('data', (chunk) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const text of lines.filter((l) => l.trim() !== '')) {
      let line
      try {
        line = JSON.parse(text)
      } catch {
        events.push({ event: 'unparseable', text })
        continue
      }
      if (first) {
        first = false
        clearTimeout(helloTimer)
        if (isHello(line)) resolveHello(line)
        else rejectHello(Object.assign(new Error('the first line is not hello'), { line }))
        continue
      }
      if (line.id !== undefined && pending.has(line.id)) {
        const waiter = pending.get(line.id)
        pending.delete(line.id)
        clearTimeout(waiter.timer)
        waiter.resolve(line)
      } else if (line.event !== undefined) {
        events.push(line)
        for (const listener of listeners) listener(line)
      }
    }
  })
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })))
  const hello = await helloPromise
  writable.write(`${JSON.stringify({ ok: true })}\n`)
  return {
    child,
    hello,
    events,
    exited,
    stderr: stderrOf,
    request(name, fields = {}, timeoutMs = 5000) {
      return new Promise((resolve, reject) => {
        const id = nextId++
        const timer = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`${name} got no reply within ${timeoutMs} ms`))
        }, timeoutMs)
        pending.set(id, { resolve, timer })
        writable.write(`${JSON.stringify({ id, [REQUEST_KEY]: name, ...fields })}\n`)
      })
    },
    waitForEvent(predicate, timeoutMs = 3000) {
      const found = events.find(predicate)
      if (found) return Promise.resolve(found)
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          listeners.delete(listener)
          resolve(null)
        }, timeoutMs)
        const listener = (event) => {
          if (!predicate(event)) return
          clearTimeout(timer)
          listeners.delete(listener)
          resolve(event)
        }
        listeners.add(listener)
      })
    },
    async close() {
      if (child.exitCode !== null) return exited
      writable.end?.()
      child.stdin?.end?.()
      const timer = setTimeout(() => child.kill('SIGKILL'), 3000)
      const result = await exited
      clearTimeout(timer)
      return result
    },
  }
}

/** Start a helper that speaks the protocol on stdio (the fake helper). */
export async function startStdioHelper(command, args = [], { env = process.env, helloTimeoutMs = 5000 } = {}) {
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], env })
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-4000)))
  return attach({ readable: child.stdout, writable: child.stdin, child, helloTimeoutMs, stderrOf: () => stderr })
}

/**
 * Start a helper the way the driver serves it (helper-and-protocol.md): a Unix socket and a token file in a mode-700
 * directory under /tmp, `--socket <path> --token-file <path>`. The helper connects and says hello; `token` is ours to
 * compare. The directory is removed on close.
 */
export async function startSocketHelper(executable, { args = [], env = process.env, helloTimeoutMs = 8000 } = {}) {
  const dir = mkdtempSync('/tmp/cu-verifier-helper-')
  chmodSync(dir, 0o700)
  const socketPath = join(dir, 'h.sock')
  const tokenPath = join(dir, 'token')
  const token = randomBytes(16).toString('hex')
  writeFileSync(tokenPath, token, { mode: 0o600 })
  const server = net.createServer()
  await new Promise((resolve, reject) => server.listen(socketPath, resolve).once('error', reject))
  const connected = new Promise((resolve) => server.once('connection', resolve))
  const child = spawn(executable, ['--socket', socketPath, '--token-file', tokenPath, ...args], { stdio: ['ignore', 'ignore', 'pipe'], env })
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-4000)))
  const cleanup = () => {
    server.close()
    if (/^\/tmp\/cu-verifier-helper-[A-Za-z0-9]{6}$/.test(dir)) rmSync(dir, { recursive: true, force: true })
  }
  const socket = await Promise.race([connected, new Promise((resolve) => setTimeout(() => resolve(null), helloTimeoutMs))])
  if (!socket) {
    child.kill('SIGKILL')
    cleanup()
    throw new Error(`the helper never connected: ${stderr.slice(-300)}`)
  }
  const helper = await attach({ readable: socket, writable: socket, child, helloTimeoutMs, stderrOf: () => stderr })
  const close = helper.close
  return { ...helper, token, async close() { const result = await close(); socket.destroy(); cleanup(); return result } }
}
