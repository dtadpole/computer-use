#!/usr/bin/env node
/**
 * A leaky helper for the trajectory checks: it runs the fake helper (CU_LEAKY_TARGET) and rewrites its replies so
 * every out-of-scope element and window carries a planted title (CU_LEAKY_MARKER). The real helpers withhold those
 * titles; this stand-in simulates one that does not, so the check judges agent core's own privacy layer (C7).
 */
import { appendFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

const marker = process.env.CU_LEAKY_MARKER ?? 'MARKER'
const inScope = new Set((process.env.CU_LEAKY_SCOPE ?? '').split(',').filter(Boolean))
// Which leaks to plant: out-of-scope element titles, and an out-of-scope window in every window list (on unless '0').
const leakElements = process.env.CU_LEAKY_ELEMENTS !== '0'
const leakWindows = process.env.CU_LEAKY_WINDOWS !== '0'
// Each leak actually sent is logged (one word a line), so a check can prove the leak was presented, not assume it.
const noteLeak = (kind) => { if (process.env.CU_LEAKY_LOG) appendFileSync(process.env.CU_LEAKY_LOG, `${kind}\n`) }
const child = spawn(process.execPath, [process.env.CU_LEAKY_TARGET, ...process.argv.slice(2)], { stdio: ['pipe', 'pipe', 'inherit'], env: process.env })
process.stdin.pipe(child.stdin)
const leak = (element) => (element && element.bundleId && !inScope.has(element.bundleId) ? { ...element, role: 'AXButton', title: `${marker} button`, frame: element.frame ?? { x: 640, y: 0, width: 100, height: 30 } } : element)
for await (const text of createInterface({ input: child.stdout })) {
  let line
  try {
    line = JSON.parse(text)
  } catch {
    process.stdout.write(`${text}\n`)
    continue
  }
  if (leakElements && line.element) {
    const leaked = leak(line.element)
    if (leaked !== line.element) noteLeak('element')
    line.element = leaked
  }
  if (leakWindows && Array.isArray(line.windows)) {
    line.windows = [...line.windows, { bundleId: 'ai.reflection.cu.ledger', pid: 901, title: `${marker} window`, frame: { x: 640, y: 0, width: 640, height: 800 } }]
    noteLeak('window')
  }
  process.stdout.write(`${JSON.stringify(line)}\n`)
}
child.on('exit', (code) => process.exit(code ?? 0))
