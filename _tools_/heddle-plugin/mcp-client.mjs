import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

/**
 * The smallest MCP stdio client the heddle plugin needs (heddle has no MCP client; heddle-tool-path.md, path C): it
 * starts one server process on the first call, does the `initialize` handshake, sends `tools/call`, and sends
 * `notifications/cancelled` when a call's signal aborts. Closing stdin stops the server (and any run in it).
 */
export function createMcpClient({ command = process.execPath, args = [], env, spawnProcess = spawn, protocolVersion = '2025-11-25' } = {}) {
  let child = null
  let ready = null
  let nextId = 1
  let active = 0
  const waiting = new Map()
  // Measured: a server child left referenced keeps heddle's process alive after its turn ends. So the child and its
  // pipes are referenced only while a call is in flight, and idle otherwise.
  const setRef = (on) => {
    if (child === null) return
    for (const handle of [child, child.stdin, child.stdout, child.stderr]) handle?.[on ? 'ref' : 'unref']?.()
  }
  const hold = () => { if (active++ === 0) setRef(true) }
  const release = () => { if (--active === 0) setRef(false) }

  const send = (message) => child.stdin.write(JSON.stringify(message) + '\n')
  const request = (method, params) => {
    const id = nextId++
    return { id, promise: new Promise((resolve, reject) => { waiting.set(id, { resolve, reject }); send({ jsonrpc: '2.0', id, method, params }) }) }
  }

  function start() {
    if (ready !== null) return ready
    child = spawnProcess(command, args, { stdio: ['pipe', 'pipe', 'pipe'], ...(env ? { env } : {}) })
    const fail = (error) => {
      for (const { reject } of waiting.values()) reject(error)
      waiting.clear()
      child = null
      ready = null
    }
    child.on('exit', (code, signal) => fail(new Error(`the computer-use server exited (${signal ?? code})`)))
    child.on('error', fail)
    child.stderr.on('data', () => {}) // the server logs to stderr; heddle's own log is not ours to fill
    createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', (line) => {
      let message
      try {
        message = JSON.parse(line)
      } catch {
        return
      }
      const entry = waiting.get(message.id)
      if (entry === undefined) return
      waiting.delete(message.id)
      if (message.error) entry.reject(Object.assign(new Error(message.error.message), { code: message.error.code }))
      else entry.resolve(message.result)
    })
    hold()
    ready = request('initialize', { protocolVersion, capabilities: {}, clientInfo: { name: 'heddle-computer-use', version: '0.1.0' } }).promise
      .then((result) => {
        send({ jsonrpc: '2.0', method: 'notifications/initialized' })
        return result
      })
      .finally(release)
    return ready
  }

  /** Call one tool; resolves the MCP result (`{ content, isError? }`); an aborted signal cancels it on the server. */
  async function callTool(name, args, { signal } = {}) {
    hold()
    try {
      return await callHeld(name, args, signal)
    } finally {
      release()
    }
  }

  async function callHeld(name, args, signal) {
    await start()
    if (signal?.aborted) throw Object.assign(new Error('cancelled'), { code: 'cancelled' })
    const { id, promise } = request('tools/call', { name, arguments: args ?? {} })
    if (signal === undefined) return promise
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        waiting.delete(id)
        if (child !== null) send({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: id, reason: 'the heddle turn was stopped' } })
        reject(Object.assign(new Error('cancelled'), { code: 'cancelled' }))
      }
      signal.addEventListener('abort', onAbort, { once: true })
      promise.then((result) => { signal.removeEventListener('abort', onAbort); resolve(result) }, (error) => { signal.removeEventListener('abort', onAbort); reject(error) })
    })
  }

  /** Close stdin (the server stops its run and exits); kill it if it has not exited after `graceMs`. */
  async function close({ graceMs = 15_000 } = {}) {
    const running = child
    if (running === null) return
    const exited = new Promise((resolve) => running.once('exit', resolve))
    running.stdin.end()
    const timer = setTimeout(() => running.kill('SIGKILL'), graceMs)
    await exited
    clearTimeout(timer)
  }

  /** For a process 'exit' hook: close the server's stdin at once; it stops its run and exits on its own. */
  function closeSync() {
    try { child?.stdin.destroy() } catch { /* already closed */ }
  }

  return { callTool, close, closeSync, started: () => child !== null, pid: () => child?.pid ?? null }
}
