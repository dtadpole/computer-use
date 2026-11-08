/**
 * A minimal MCP client over stdio for the session-integration verifier: it starts a server as a child process and
 * speaks newline-delimited JSON-RPC 2.0 to it, as DSH's stdio transport does. Judge-side only (D-012): it knows the
 * protocol, not the server's code.
 */

import { spawn } from 'node:child_process'

/** Parse a stream of newline-delimited JSON messages; returns `push(chunk)` that yields complete messages. */
export function lineReader() {
  let buffer = ''
  return (chunk) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop()
    return lines.filter((line) => line.trim() !== '').map((line) => JSON.parse(line))
  }
}

/**
 * Start `node <script> ...args`. Resolves to `{ request(method, params, timeoutMs), notify(method, params),
 * callTool(name, args, timeoutMs), closeInput(), exited, child, stderr() }`.
 */
export function startMcpServer(script, args = [], { env = process.env } = {}) {
  const child = spawn(process.execPath, [script, ...args], { stdio: ['pipe', 'pipe', 'pipe'], env })
  const pending = new Map()
  let nextId = 1
  let stderr = ''
  const read = lineReader()
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    for (const message of read(chunk)) {
      if (message.id !== undefined && pending.has(message.id)) {
        const { resolve, timer } = pending.get(message.id)
        clearTimeout(timer)
        pending.delete(message.id)
        resolve(message)
      }
    }
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk) => (stderr = (stderr + chunk).slice(-4000)))
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })))
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`)
  const request = (method, params = {}, timeoutMs = 15_000) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`${method} got no answer within ${timeoutMs} ms`))
      }, timeoutMs)
      pending.set(id, { resolve, timer })
      send({ jsonrpc: '2.0', id, method, params })
    })
  return {
    child,
    exited,
    stderr: () => stderr,
    request,
    notify: (method, params = {}) => send({ jsonrpc: '2.0', method, params }),
    /** Call a tool; resolves to `{ isError, texts, images, json }` where `json` parses the first text when it can. */
    async callTool(name, args = {}, timeoutMs = 70_000) {
      const reply = await request('tools/call', { name, arguments: args }, timeoutMs)
      if (reply.error) return { isError: true, texts: [reply.error.message], images: [], json: null, rpcError: reply.error }
      const content = reply.result?.content ?? []
      const texts = content.filter((block) => block.type === 'text').map((block) => block.text)
      const images = content.filter((block) => block.type === 'image')
      let json = null
      try {
        json = texts.length ? JSON.parse(texts[0]) : null
      } catch {
        json = null
      }
      return { isError: reply.result?.isError === true, texts, images, json }
    },
    closeInput: () => child.stdin.end(),
  }
}
