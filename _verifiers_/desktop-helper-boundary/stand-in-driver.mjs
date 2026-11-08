#!/usr/bin/env node
/**
 * A stand-in driver for the D-029 boundary checks: hosts the helper's socket and token file in a mode-700 directory,
 * starts CUHelper with --enforce-boundary, and reports what happened as one JSON line. Started as plain
 * `node <this file>` from inside the project, so it meets the helper's peer rule; the impostor and flag cases start
 * it from elsewhere or with flags. Arguments: <helper executable> <window-table executable or ->.
 */
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { chmodSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { join } from 'node:path'

const [executable, windowTable] = process.argv.slice(2)
const dir = mkdtempSync('/tmp/cu-verifier-helper-')
chmodSync(dir, 0o700)
const socketPath = join(dir, 'h.sock')
const tokenPath = join(dir, 'token')
const token = randomBytes(16).toString('hex')
writeFileSync(tokenPath, token, { mode: 0o600 })
const report = { connected: false, bytes: 0, hello: null, windowsWhileConnected: null, exit: null, stderr: '' }
const server = net.createServer()
await new Promise((resolve) => server.listen(socketPath, resolve))
// The launch pins name this very process (as the driver's launch.mjs pins agent core's entry), so a refusal comes from
// the rule under test, not from missing pins.
const pins = ['--driver-node', process.execPath, '--driver-entry', realpathSync(process.argv[1])]
const child = spawn(executable, ['--socket', socketPath, '--token-file', tokenPath, '--enforce-boundary', ...pins], { stdio: ['ignore', 'ignore', 'pipe'] })
child.stderr.on('data', (chunk) => (report.stderr += chunk))
const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)))
server.on('connection', (socket) => {
  report.connected = true
  let buffer = ''
  socket.on('data', async (chunk) => {
    report.bytes += chunk.length
    buffer += chunk
    if (report.hello === null && buffer.includes('\n')) {
      report.hello = JSON.parse(buffer.slice(0, buffer.indexOf('\n')))
      await new Promise((resolve) => setTimeout(resolve, 800))
      if (windowTable && windowTable !== '-') report.windowsWhileConnected = JSON.parse(execFileSync(windowTable, [String(child.pid)], { encoding: 'utf8' }))
      socket.write(`${JSON.stringify({ id: 1, type: 'bye' })}\n`)
    }
  })
})
const timer = setTimeout(() => child.kill('SIGKILL'), 15_000)
report.exit = await exited
clearTimeout(timer)
report.stderr = report.stderr.trim().slice(-200)
report.tokenMatches = report.hello ? report.hello.token === token : null
server.close()
rmSync(dir, { recursive: true, force: true })
process.stdout.write(`${JSON.stringify(report)}\n`)
