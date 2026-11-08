/**
 * Judging helpers for the desktop verifiers (ULTIMATE_GOAL 2.0), over outside evidence only (D-012): CU Fixture's
 * input log (`state.input`), its control frames (`targets`), and the files of a run directory. Nothing here imports
 * the system under test.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { decodePng } from './png.mjs'

/** The tag every synthetic event carries in `kCGEventSourceUserData`: 0x43555345, 'CUSE' (desktop-extension 0.2, input-and-targets). */
export const SYNTHETIC_TAG = 0x43555345

/** Input-log kinds that are presses; a click is a down and an up. */
const DOWNS = new Set(['mouseDown', 'rightMouseDown', 'otherMouseDown'])

/**
 * Where each press landed relative to a target frame `{ x, y, width, height, cx, cy, window }` (window points,
 * top-left): `{ press, dx, dy, distance, inside }` per press on the target's window.
 */
export function landings(input, target) {
  return input
    .filter((event) => DOWNS.has(event.kind) && event.window === target.window)
    .map((press) => {
      const dx = press.x - target.cx
      const dy = press.y - target.cy
      const inside = press.x >= target.x && press.x <= target.x + target.width && press.y >= target.y && press.y <= target.y + target.height
      return { press, dx, dy, distance: Math.hypot(dx, dy), inside }
    })
}

/** True when exactly one press landed within `tolerance` points of the target's centre and inside it. */
export function landedOn(input, target, { tolerance = 1 } = {}) {
  const hits = landings(input, target)
  return hits.length === 1 && hits[0].inside && Math.abs(hits[0].dx) <= tolerance && Math.abs(hits[0].dy) <= tolerance
}

/** The input events posted by `pid` with synthetic `tag`, and every other event (a person's, or a foreign process's). */
export function bySource(input, { pid, tag = SYNTHETIC_TAG }) {
  const synthetic = input.filter((event) => event.pid === pid && event.tag === tag)
  return { synthetic, other: input.filter((event) => !synthetic.includes(event)) }
}

/** Events after time `t` (seconds since the epoch) carrying the synthetic tag: what a pause must keep at zero. */
export function taggedAfter(input, t, tag = SYNTHETIC_TAG) {
  return input.filter((event) => event.t > t && event.tag === tag)
}

const BUTTON_UPS = { mouseDown: 'mouseUp', rightMouseDown: 'rightMouseUp', otherMouseDown: 'otherMouseUp' }

/**
 * What a run left pressed (D-028, R86 stuck input): mouse buttons pressed and never released, keys down and never up
 * (repeats ignored), and modifiers still held at the end. `tag` keeps only the agent's events (the design's tag by
 * default; pass null for every event). An empty result means every down had its up.
 */
export function stuckInput(input, { tag = SYNTHETIC_TAG } = {}) {
  const events = tag === null ? input : input.filter((event) => event.tag === tag)
  const buttons = new Map()
  const keys = new Map()
  let modifiers = 0
  for (const event of events) {
    if (BUTTON_UPS[event.kind]) buttons.set(`${event.kind}:${event.button ?? 0}`, event)
    else if (Object.values(BUTTON_UPS).includes(event.kind)) {
      const down = Object.keys(BUTTON_UPS).find((kind) => BUTTON_UPS[kind] === event.kind)
      buttons.delete(`${down}:${event.button ?? 0}`)
    } else if (event.kind === 'keyDown' && !event.repeat) keys.set(event.keyCode, event)
    else if (event.kind === 'keyUp') keys.delete(event.keyCode)
    else if (event.kind === 'flagsChanged') modifiers = event.modifiers ?? 0
  }
  return {
    buttons: [...buttons.values()],
    keys: [...keys.values()],
    modifiers,
    clean: buttons.size === 0 && keys.size === 0 && modifiers === 0,
  }
}

/** True for a pixel matching the stand-in marker colour (sRGB #FF00FF, tolerant of display profiles). */
export const isMarker = ([r, g, b]) => r > 230 && g < 100 && b > 230

/** The share of sampled pixels of a PNG that match the marker colour (every `step`-th pixel each way). */
export function markerShare(png, { step = 4 } = {}) {
  const image = decodePng(png)
  let hits = 0
  let sampled = 0
  for (let y = 0; y < image.height; y += step) {
    for (let x = 0; x < image.width; x += step) {
      sampled++
      if (isMarker(image.pixel(x, y))) hits++
    }
  }
  return sampled === 0 ? 0 : hits / sampled
}

/** Every regular file under `dir`, recursively. */
export function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? filesUnder(path) : [path]
  })
}

/** Files of a run directory that hold `needle` (a string or Buffer) anywhere in their bytes, screenshots included. */
export function filesHolding(dir, needle) {
  const bytes = Buffer.isBuffer(needle) ? needle : Buffer.from(String(needle))
  return filesUnder(dir).filter((path) => readFileSync(path).includes(bytes))
}

/**
 * PNGs of a run directory in which at least `minShare` of sampled pixels are the marker colour: a capture of an
 * excluded or unapproved stand-in window. A PNG that cannot be decoded is reported, never skipped.
 */
export function pngsWithMarker(dir, { minShare = 0.001, step = 4 } = {}) {
  const found = []
  for (const path of filesUnder(dir).filter((file) => file.endsWith('.png'))) {
    let share
    try {
      share = markerShare(readFileSync(path), { step })
    } catch (error) {
      found.push({ path, share: null, error: error.message })
      continue
    }
    if (share >= minShare) found.push({ path, share })
  }
  return found
}
