import { createHash } from 'node:crypto'
import { appendFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { TOOLS } from '../computer-use-mcp/tools.mjs'
import { createMcpClient } from './mcp-client.mjs'

/**
 * The heddle plugin for computer use (heddle-tool-path.md, path C; D-017): loaded by a profile row in the user's own
 * $HEDDLE_HOME, with no change to heddle.
 *
 *   - id: computer-use
 *     name: <this folder>/computer-use.mjs
 *     inject: [tools, approvals]
 *     config: { serverArgs: [--seat, cu-mcp, --key-file, <gateway key file>] }
 *
 * It registers the four tools of the integration surface (the tools row's `allow` must name them) and forwards each
 * call to the computer-use MCP server, started on the first call. The schemas are the server's own (tools.mjs), so a
 * heddle session sees the same fields a DSH session does - among them `environment` (`chrome-browser`, the default, or
 * `macos-desktop`), `apps` (the bundle ids a desktop run may ask for) and `exclude_apps` - and the arguments reach the
 * server as the model gave them: this plugin adds no field, and no approval path, of its own (D-029 d).
 *
 * heddle tool results are text, so a final screenshot - a browser's or a desktop's alike - is held per session and
 * added to the next model request as a user-message image (the `model/request` waterfall); it is not in the
 * transcript, and a session resumed in another process does not see it again.
 * Config: `server` (default ../computer-use-mcp/server.mjs), `node`, `serverArgs`, `trace` (or CU_HEDDLE_TRACE: a file
 * that records each image added: session, sha256, bytes), and the test seam `client`.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
export const name = 'computer-use'
export const IMAGE_NOTE = '[computer-use] The final screenshot of the run you just checked:'

/** MCP content blocks to heddle's text output and, if present, one heddle image part. */
export function fromMcpResult(result) {
  const content = Array.isArray(result?.content) ? result.content : []
  const output = content.filter((block) => block.type === 'text').map((block) => block.text).join('\n')
  const image = content.find((block) => block.type === 'image' && typeof block.data === 'string')
  let imagePart = null
  if (image !== undefined) {
    const bytes = Buffer.from(image.data, 'base64')
    imagePart = { type: 'image', name: 'final-screenshot.png', mimeType: image.mimeType ?? 'image/png', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), data: image.data }
  }
  return { output, imagePart, isError: result?.isError === true }
}

export default function apply(ctx, config = {}) {
  const client = config.client ?? createMcpClient({
    command: config.node ?? process.execPath,
    args: [config.server ?? resolve(HERE, '..', 'computer-use-mcp', 'server.mjs'), ...(config.serverArgs ?? [])],
  })
  const pendingImages = new Map() // session id -> image part for the next model request
  // `trace` may also come from CU_HEDDLE_TRACE, so a check can observe an install row without changing it.
  const tracePath = typeof config.trace === 'string' ? config.trace : process.env.CU_HEDDLE_TRACE
  const trace = (entry) => {
    if (typeof tracePath === 'string' && tracePath !== '') appendFileSync(tracePath, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n')
  }

  for (const tool of TOOLS) {
    ctx.tools.register({
      spec: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
      run: async (args, context = {}) => {
        let result
        try {
          result = await client.callTool(tool.name, args, { signal: context.signal })
        } catch (error) {
          return { output: `computer-use: ${error.message}`, error: { code: error.code === 'cancelled' ? 'cancelled' : 'server_error', message: error.message } }
        }
        const { output, imagePart, isError } = fromMcpResult(result)
        if (imagePart !== null && context.session?.id !== undefined) {
          pendingImages.set(context.session.id, imagePart)
          trace({ event: 'image_held', session: context.session.id, sha256: imagePart.sha256, bytes: imagePart.bytes })
        }
        return isError ? { output, error: { code: 'tool_error', message: output } } : { output }
      },
    })
  }

  // The waterfall is synchronous. Side requests (a session title) carry `purpose` and are left alone.
  ctx.on('model/request', (request, next) => {
    const outgoing = next()
    if (outgoing?.purpose) return outgoing
    const image = pendingImages.get(outgoing?.sessionId)
    if (image === undefined) return outgoing
    pendingImages.delete(outgoing.sessionId)
    trace({ event: 'image_sent', session: outgoing.sessionId, sha256: image.sha256, bytes: image.bytes })
    return { ...outgoing, messages: [...outgoing.messages, { role: 'user', content: [{ type: 'text', text: IMAGE_NOTE }, image] }] }
  })

  // When heddle exits, closing the server's stdin lets it stop a live run and remove its browser before it exits.
  process.once('exit', () => client.closeSync?.())
  return { client }
}
