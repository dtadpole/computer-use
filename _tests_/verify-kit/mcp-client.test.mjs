import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'

import { lineReader, startMcpServer } from '../../_tools_/verify-kit/mcp-client.mjs'

test('lineReader yields whole JSON lines across chunk boundaries', () => {
  const read = lineReader()
  assert.deepEqual(read('{"a":1}\n{"b"'), [{ a: 1 }])
  assert.deepEqual(read(':2}\n\n'), [{ b: 2 }])
})

test('the client matches replies by id, parses tool results, and sees the server exit when input closes', async () => {
  const dir = mkdtempSync('/tmp/cu-verifier-mcp-test-')
  const script = join(dir, 'echo.mjs')
  writeFileSync(script, `process.stdin.setEncoding('utf8'); let b = ''
process.stdin.on('data', (c) => { b += c; const lines = b.split('\\n'); b = lines.pop()
  for (const l of lines.filter(Boolean)) { const m = JSON.parse(l); if (m.id === undefined) continue
    const result = m.method === 'tools/call' ? { content: [{ type: 'text', text: JSON.stringify({ echo: m.params.arguments }) }, { type: 'image', data: 'AA==', mimeType: 'image/png' }], isError: m.params.name === 'bad' } : { ok: m.method }
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }) + '\\n') } })
process.stdin.on('end', () => process.exit(0))`)
  const server = startMcpServer(script)
  try {
    assert.deepEqual((await server.request('initialize', {})).result, { ok: 'initialize' })
    const call = await server.callTool('good', { x: 1 })
    assert.deepEqual([call.isError, call.json, call.images.length], [false, { echo: { x: 1 } }, 1])
    assert.equal((await server.callTool('bad')).isError, true)
    server.closeInput()
    assert.equal((await server.exited).code, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
