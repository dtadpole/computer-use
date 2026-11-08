// A fake computer-use MCP server for the heddle-plugin suite: answers the handshake, returns text and an image for
// status, an error for control, echoes the arguments of a start that names an environment (so a test sees exactly what
// the plugin forwarded), waits forever on any other start, and logs each method to the file named by argv[2].
import { appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

const log = process.argv[2]
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const send = (message) => process.stdout.write(JSON.stringify(message) + '\n')
createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line)
  if (log) appendFileSync(log, `${message.method}\n`)
  if (message.method === 'initialize') send({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'fake' } } })
  else if (message.method === 'tools/call') {
    const { name, arguments: args } = message.params
    if (name === 'computer_use_status') send({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: `{"run_id":"${args.run_id}","state":"finished"}` }, { type: 'image', data: PNG, mimeType: 'image/png' }] } })
    else if (name === 'computer_use_control') send({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'take_over needs the control token' }], isError: true } })
    else if (name === 'computer_use_start' && args.environment !== undefined) send({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: JSON.stringify({ run_id: 'd1', received: args }) }] } })
    // any other computer_use_start never answers: the cancellation test aborts it
  }
})
process.stdin.on('end', () => process.exit(0))
