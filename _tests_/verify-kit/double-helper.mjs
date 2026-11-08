/**
 * A test double of the desktop helper protocol (desktop-extension 0.2) for the conformance checks' own tests. It is
 * the verifier's double, not the reference: cu-developer-two's fake helper is. CU_DOUBLE_BREAK names one deliberate
 * breach so each check can be shown to fail on it.
 */
import { readFileSync } from 'node:fs'
import net from 'node:net'
import { createInterface } from 'node:readline'
import { DESIGN_EXCLUSIONS } from '../../_tools_/verify-kit/helper-conformance.mjs'

const BREAK = process.env.CU_DOUBLE_BREAK ?? ''

const isExcluded = (bundleId) => DESIGN_EXCLUSIONS.some((entry) => (entry.endsWith('.') ? bundleId.startsWith(entry) : bundleId === entry))
// Request fields as Protocol.swift validates them (plus the design's simulateLocalInput seam).
const FIELDS = { scope: ['bundleIds'], capture: ['display', 'maxSize', 'region', 'simulateScale'], input: ['events', 'mode', 'bundleId'], hitTest: ['xPt', 'yPt'], focused: [], screenText: ['maxChars'], watch: ['fps', 'maxSize'], unwatch: [], pauseOnLocalInput: ['on'], simulateLocalInput: ['kind', 'via'], bye: [] }
const arg = (name) => { const at = process.argv.indexOf(name); return at === -1 ? undefined : process.argv[at + 1] }
const socketPath = arg('--socket')
const socket = socketPath ? await new Promise((resolve) => { const s = net.connect(socketPath, () => resolve(s)) }) : null
const token = socketPath ? readFileSync(arg('--token-file'), 'utf8') : 't'
const out = (line) => (socket ? socket.write(`${JSON.stringify(line)}\n`) : process.stdout.write(`${JSON.stringify(line)}\n`))
const fail = (id, code) => out({ id, ok: false, code, message: code })

let scope = null
let armed = false
let paused = false
out({ type: 'hello', token: BREAK === 'bad-token' ? 'not-the-token' : token, protocol: 1, helperVersion: '0.2.49', ...(BREAK === 'bad-hello' ? {} : { grants: { screen: false, accessibility: false, postEvents: false, listenEvents: false } }), displays: [{ widthPt: 1920, heightPt: 1080, scale: 1 }] })

for await (const text of createInterface({ input: socket ?? process.stdin })) {
  const line = JSON.parse(text)
  if (line.id === undefined) continue
  const { id, type, ...fields } = line
  if (!(type in FIELDS)) { if (BREAK === 'unknown-ok') out({ id, ok: true }); else fail(id, 'unknown_request'); continue }
  if (BREAK !== 'field-ok' && Object.keys(fields).some((key) => !FIELDS[type].includes(key))) { fail(id, 'unknown_field'); continue }
  if (type === 'scope') {
    if (BREAK !== 'excluded-accepted' && fields.bundleIds.some(isExcluded)) { fail(id, 'excluded'); continue }
    scope = fields.bundleIds; out({ id, ok: true })
  } else if (type === 'capture') {
    if (BREAK === 'capture-unscoped') out({ id, ok: true, widthPx: 1, heightPx: 1 })
    else if (!scope) fail(id, 'no_scope'); else fail(id, 'not_granted')
  } else if (type === 'input') {
    if (BREAK === 'input-granted') { out({ id, ok: true, done: true }); continue }
    if (!scope) fail(id, 'no_scope'); else if (paused) fail(id, 'local_input'); else fail(id, 'not_granted')
  } else if (type === 'pauseOnLocalInput') {
    armed = fields.on === true; out({ id, ok: true })
  } else if (type === 'simulateLocalInput') {
    out({ id, ok: true })
    if (armed && BREAK !== 'no-pause') { paused = true; out({ event: 'localInput', at: new Date().toISOString(), kind: fields.kind }) }
  } else if (type === 'bye') {
    out({ id, ok: true })
    if (BREAK !== 'no-exit') process.exit(0)
  } else {
    fail(id, 'unsupported')
  }
}
