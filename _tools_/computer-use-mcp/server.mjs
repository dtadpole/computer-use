#!/usr/bin/env node
/**
 * The computer-use MCP server over stdio (design: integration-surface.md; facts: dsh-mcp-stdio.md). DSH and heddle
 * sessions load it by configuration:
 *
 *   node server.mjs [--seat cu-name] [--runs-dir DIR] [--key-file PATH] [--viewport WxH]
 *
 * JSON-RPC 2.0, one message per line on stdin and stdout; logs go to stderr only. Start-up is cheap and launches no
 * browser or helper (a client may start it twice to probe); unknown methods, `server/discover` included, answer
 * -32601; a cancelled `tools/call` gets no answer; closing stdin stops the active run, closes its live view and exits.
 * The `--key-file` path (not the key) reaches the gateway adapter, which reads the key at request time (D-007).
 *
 * Desktop runs (`environment: 'macos-desktop'`) need this file running as plain `node <path>/server.mjs`: the desktop
 * helper's peer check names this script as one of its entry points (helper-boundary.md, D-029 a) and refuses a peer
 * whose exec-time environment can load other code or which has node flags before the entry. Every DSH shell sets
 * NODE_PATH, so a start like that re-executes itself once, clean (`execClean`), and the child serves. `main` takes the
 * run manager's test seams from a caller in code, never from the command line, so no flag can point a server at a
 * fake helper.
 */
import { spawn } from 'node:child_process'
import { realpathSync, writeFileSync } from 'node:fs'
import { constants } from 'node:os'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { createRunManager } from './runs.mjs'
import { checkControl, checkRespond, checkStart, checkStatus, ToolInputError, TOOLS } from './tools.mjs'

export const SERVER_INFO = Object.freeze({ name: 'computer-use', version: '0.2.0' })
export const PROTOCOL_VERSIONS = Object.freeze(['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'])
const INSTRUCTIONS = "Computer use in a fresh headless Chrome (the default) or, with environment 'macos-desktop', in apps already running on this Mac, named in apps. Start a run with computer_use_start, then poll computer_use_status (wait_seconds up to 50) until state is finished; the result carries the final screenshot and the trajectory link. Consent for consequential steps, and each desktop app the run may use, come only from a person in the live view."

/** Parse `--name value` pairs. */
export function parseServerArgs(argv) {
  const options = {}
  for (let i = 0; i < argv.length; i += 1) {
    const match = /^--([a-z-]+)$/.exec(argv[i])
    if (match === null || argv[i + 1] === undefined) throw new Error(`unexpected argument '${argv[i]}'`)
    options[match[1]] = argv[i + 1]
    i += 1
  }
  const viewport = options.viewport ? /^(\d{3,4})x(\d{3,4})$/.exec(options.viewport) : null
  if (options.viewport && viewport === null) throw new Error('--viewport must be WIDTHxHEIGHT')
  return {
    seat: options.seat,
    runsDirectory: options['runs-dir'] ? resolve(options['runs-dir']) : undefined,
    keyFile: options['key-file'],
    viewport: viewport ? { width: Number(viewport[1]), height: Number(viewport[2]) } : undefined,
  }
}

/**
 * The protocol core, transport-free for tests: `handle(message, send)` processes one parsed message and calls
 * `send(reply)` at most once; `cancel(requestId)` aborts a call in flight.
 */
export function createMcpServer({ manager }) {
  const inFlight = new Map()

  async function callTool(name, args, signal) {
    switch (name) {
      case 'computer_use_start': {
        const started = await manager.start(checkStart(args))
        return { content: [{ type: 'text', text: JSON.stringify(started, null, 2) }] }
      }
      case 'computer_use_status': {
        const { content } = await manager.status(checkStatus(args), { signal })
        return { content }
      }
      case 'computer_use_respond':
        return { content: [{ type: 'text', text: JSON.stringify(manager.respond(checkRespond(args))) }] }
      case 'computer_use_control':
        return { content: [{ type: 'text', text: JSON.stringify(manager.control(checkControl(args))) }] }
      default:
        throw new ToolInputError(`unknown tool '${name}'`)
    }
  }

  async function handle(message, send) {
    if (message === null || typeof message !== 'object' || message.jsonrpc !== '2.0') {
      send({ jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32600, message: 'invalid request' } })
      return
    }
    const { id, method } = message
    // JSON-RPC lets params be left out; null is read the same, so it cannot fail deep inside a tool with a TypeError's text.
    const params = message.params ?? {}
    const isRequest = id !== undefined && id !== null
    if (!isRequest) {
      if (method === 'notifications/cancelled') inFlight.get(params.requestId)?.abort()
      return // other notifications (initialized, progress) need nothing
    }
    const reply = (result) => send({ jsonrpc: '2.0', id, result })
    switch (method) {
      case 'initialize': {
        const requested = params.protocolVersion
        reply({
          protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: INSTRUCTIONS,
        })
        return
      }
      case 'ping':
        reply({})
        return
      case 'tools/list':
        reply({ tools: TOOLS })
        return
      case 'tools/call': {
        // The shape is the protocol's, not a tool input: a non-object params or arguments is -32602 (CU-67), rather than
        // a string read key by key or a refusal that names the wrong thing.
        const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
        if (!isObject(params) || (params.arguments !== undefined && params.arguments !== null && !isObject(params.arguments))) {
          send({ jsonrpc: '2.0', id, error: { code: -32602, message: 'invalid params: tools/call takes { name, arguments } with arguments an object' } })
          return
        }
        const abort = new AbortController()
        inFlight.set(id, abort)
        let result
        try {
          result = await callTool(params.name, params.arguments ?? {}, abort.signal)
        } catch (error) {
          result = { content: [{ type: 'text', text: error instanceof ToolInputError ? error.message : `error: ${error?.message ?? error}` }], isError: true }
        } finally {
          inFlight.delete(id)
        }
        if (!abort.signal.aborted) reply(result) // a cancelled request gets no answer
        return
      }
      default:
        send({ jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${method}` } })
    }
  }

  return { handle, cancel: (requestId) => inFlight.get(requestId)?.abort() }
}

/** Serve over the given streams; resolves when input closes and the active run has been stopped. */
export async function serveStdio({ input = process.stdin, output = process.stdout, manager }) {
  const server = createMcpServer({ manager })
  const send = (message) => output.write(JSON.stringify(message) + '\n')
  const lines = createInterface({ input, crlfDelay: Infinity })
  const pending = new Set()
  for await (const line of lines) {
    if (line.trim() === '') continue
    let message
    try {
      message = JSON.parse(line)
    } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'parse error' } })
      continue
    }
    const task = server.handle(message, send).catch((error) => process.stderr.write(`computer-use-mcp: ${error?.stack ?? error}\n`))
    pending.add(task)
    task.finally(() => pending.delete(task))
  }
  await manager.shutdown()
  await Promise.race([Promise.allSettled([...pending]), new Promise((resolveTimeout) => setTimeout(resolveTimeout, 2000).unref?.())])
}

/**
 * Serve on this process's stdio: parse `argv`, run until stdin closes, exit. `managerOptions` reaches the run manager
 * as is - the test seams (a fake helper for desktop runs, see runs.mjs) come only this way, from a test's own entry
 * script, so the shipped command line cannot select them.
 */
export function main(argv = process.argv.slice(2), { managerOptions = {} } = {}) {
  let options
  try {
    options = parseServerArgs(argv)
  } catch (error) {
    process.stderr.write(`computer-use-mcp: ${error.message}\n`)
    process.exit(64)
  }
  const manager = createRunManager({ ...options, ...managerOptions })
  // A client that ends us with a signal still gets an orderly stop: the run ends cancelled and its environment is closed.
  // A repeat is ignored, not fatal: after a clean re-exec a terminal's Ctrl-C or a process-group kill reaches this
  // process twice, directly and forwarded by the parent, and the second must not cut the stop short. The stop is
  // bounded (runs.mjs `shutdown`), so ignoring repeats cannot hang the process.
  let stopping = null
  const stopOnSignal = () => { stopping ??= manager.shutdown().finally(() => process.exit(0)) }
  process.on('SIGTERM', stopOnSignal)
  process.on('SIGINT', stopOnSignal)
  serveStdio({ manager }).then(() => process.exit(0), (error) => {
    process.stderr.write(`computer-use-mcp: ${error?.stack ?? error}\n`)
    process.exit(1)
  })
  return manager
}

/**
 * True when this module is the program node started, through any symlink: resolve() keeps symlinks while
 * import.meta.url is the real path, so a server started through a symlinked path (macOS /tmp and /var are ones) used
 * to exit at once having served nothing (cu-verifier). The same two-realpath check as agent core's cli.mjs; false on
 * any error, such as an entry that no longer exists.
 */
export function isEntryPoint(argv1, moduleUrl) {
  if (!argv1) return false
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl))
  } catch {
    return false
  }
}

/** A variable that can load code into node: the helper refuses a peer whose exec-time environment holds one (D-029 a). */
const isLoader = (name) => /^(DYLD_|LD_)/.test(name) || ['NODE_OPTIONS', 'NODE_PATH', 'NODE_REPL_EXTERNAL_MODULE', 'NODE_ICU_DATA'].includes(name)

/** The environment without the loader variables - deleted, not emptied (helper-boundary.md); every other one kept. */
export function withoutLoaders(env) {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !isLoader(name)))
}

/**
 * Set in the re-executed child's environment, so the child never execs again: should anything re-add a loader variable
 * or a flag (a wrapper standing at process.execPath, say), the child serves as it is and says why desktop runs will be
 * refused, instead of looping. cli.mjs needs no marker because its child is clean by construction; this server
 * re-execs on any unclean start, so it guards the loop explicitly. Set by hand, it keeps a debugging start such as
 * `node --inspect server.mjs` in one process (desktop runs are then refused).
 */
export const CLEAN_EXEC_MARKER = 'CU_MCP_CLEAN_EXEC'

/**
 * Whether this process must re-execute itself clean before serving: its environment holds a loader variable or node
 * has flags before the entry, and the marker is absent. Unlike cli.mjs, which re-execs only a desktop `run`, a server
 * cannot know at start whether a desktop run will come, so any unclean start re-execs; a browser run loses nothing.
 */
export function needsCleanExec(env, execArgv = []) {
  if (env[CLEAN_EXEC_MARKER] !== undefined) return false
  return Object.keys(env).some(isLoader) || execArgv.length > 0
}

/**
 * Re-execute this server once as plain `node <entry> ...args` (cu-developer-three's rules): the binary is
 * process.execPath; argv is the entry as node got it (process.argv[1], as cli.mjs passes it - the helper's peer check
 * takes its realpath) and then the original arguments; node flags are dropped; the loader variables are deleted from a
 * copy of the environment and the marker is set. Stdio is inherited, so the client's JSON-RPC stream goes straight to
 * the child and nothing here reads or writes it. This process only waits, forwards SIGTERM and SIGINT, and ends as the
 * child ended: its exit code, or the same signal raised again. Killed unforwardable (SIGKILL), this process leaves the
 * child to end as any server does - when the client goes, its stdin closes. CU-239: a forwarded signal and a child that
 * ended by a signal each leave one stderr line (signal names and pids only), so an exit no test expected names its path.
 */
export function execClean({ argv = process.argv, env = process.env, execPath = process.execPath } = {}) {
  const child = spawn(execPath, [argv[1], ...argv.slice(2)], { stdio: 'inherit', env: { ...withoutLoaders(env), [CLEAN_EXEC_MARKER]: '1' } })
  const signals = ['SIGTERM', 'SIGINT']
  const forward = (signal) => {
    process.stderr.write(`computer-use-mcp: forwarding ${signal} to the serving child (pid ${child.pid ?? 'none'})\n`)
    child.kill(signal)
  }
  for (const signal of signals) process.on(signal, forward)
  child.once('error', (error) => {
    process.stderr.write(`computer-use-mcp: the clean re-exec failed: ${error.message}\n`)
    if (child.pid === undefined) process.exit(1) // never started; a failed forward alone leaves the child serving
  })
  child.once('exit', (code, signal) => {
    for (const name of signals) process.removeListener(name, forward)
    if (signal === null) process.exit(code ?? 1)
    process.stderr.write(`computer-use-mcp: the serving child (pid ${child.pid}) ended by ${signal}; ending the same way\n`)
    // With the listeners gone the signal takes its default action and the client sees what the child saw; one that does
    // not end node by default (SIGPIPE is ignored) leaves the shell's 128 + its number as the exit code instead.
    process.exitCode = 128 + (constants.signals[signal] ?? 0)
    process.kill(process.pid, signal)
  })
  return child
}

/**
 * Test hook, inert unless set: with CU_MCP_TEST_PROCESS_REPORT naming a file, the serving process writes there, before
 * it serves, its pid, parent pid, node flags, argv and environment variable names (never values). No reply on the wire
 * can show which process answers or what it was started with; this lets a test see that it is the clean child.
 */
function reportProcess(path, reexecuted) {
  const report = { pid: process.pid, ppid: process.ppid, execArgv: process.execArgv, argv: process.argv, envNames: Object.keys(process.env).sort(), reexecuted }
  writeFileSync(path, JSON.stringify(report) + '\n')
}

/** Started as the program: serve, or re-exec clean once and pass through. */
function startAsProgram() {
  if (needsCleanExec(process.env, process.execArgv)) {
    execClean()
    return
  }
  const reexecuted = process.env[CLEAN_EXEC_MARKER] !== undefined
  // Read once, then gone: processes this server starts do not inherit the marker, so a server started from one re-execs.
  delete process.env[CLEAN_EXEC_MARKER]
  const unclean = [...Object.keys(process.env).filter(isLoader), ...process.execArgv]
  if (unclean.length > 0) process.stderr.write(`computer-use-mcp: serving without a clean re-exec (${unclean.join(', ')}); the desktop helper refuses such a process, so desktop runs will fail\n`)
  if (process.env.CU_MCP_TEST_PROCESS_REPORT) reportProcess(process.env.CU_MCP_TEST_PROCESS_REPORT, reexecuted)
  main()
}

if (isEntryPoint(process.argv[1], import.meta.url)) startAsProgram()
