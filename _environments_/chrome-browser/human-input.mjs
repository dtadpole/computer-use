import { EnvironmentError, invalid } from './errors.mjs'
import { chordMeaning, keyDescriptor, MODIFIER_BITS, normalizeKey } from './keys.mjs'

/**
 * A person's input from the live view, during take-over only (design: live-control.md, R39), planned into CDP steps
 * the same way an agent action is. Coordinates are viewport CSS pixels (the live view maps its picture of the screen to
 * them). Event shapes:
 *
 * - `{ type: 'mouse', action: 'move' | 'down' | 'up', x, y, button?, clickCount?, modifiers? }`
 * - `{ type: 'wheel', x, y, deltaX, deltaY, modifiers? }`
 * - `{ type: 'key', action: 'down' | 'up', key, modifiers? }` - `key` is the browser's `KeyboardEvent.key`
 * - `{ type: 'text', text }` - text the person pasted or typed through an input method
 *
 * `modifiers` is `{ alt, ctrl, meta, shift }`. Editing chords carry their macOS command, browser chords become
 * navigations and clipboard chords use the run's clipboard, as for the agent; window chords are refused.
 */

const BUTTONS = Object.freeze({ left: 1, right: 2, middle: 4, none: 0 })

function mask(modifiers = {}) {
  return (modifiers.alt ? MODIFIER_BITS.Alt : 0) | (modifiers.ctrl ? MODIFIER_BITS.Control : 0) |
    (modifiers.meta ? MODIFIER_BITS.Meta : 0) | (modifiers.shift ? MODIFIER_BITS.Shift : 0)
}

function point(event, viewport) {
  const { x, y } = event
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= viewport.width || y >= viewport.height) {
    throw invalid('human input needs a point inside the viewport')
  }
  return { x, y }
}

export function planHumanInput(event, viewport) {
  if (event === null || typeof event !== 'object') throw invalid('human input must be an object')
  const modifiers = mask(event.modifiers)
  switch (event.type) {
    case 'mouse': {
      const { x, y } = point(event, viewport)
      const type = { move: 'mouseMoved', down: 'mousePressed', up: 'mouseReleased' }[event.action]
      if (type === undefined) throw invalid('mouse action is move, down or up')
      const button = event.button ?? (event.action === 'move' ? 'none' : 'left')
      if (BUTTONS[button] === undefined) throw invalid(`unknown mouse button '${button}'`)
      const clickCount = Number.isInteger(event.clickCount) && event.clickCount > 0 && event.clickCount <= 3 ? event.clickCount : (event.action === 'move' ? 0 : 1)
      return [{
        method: 'Input.dispatchMouseEvent',
        params: { type, x, y, button, buttons: event.action === 'down' ? BUTTONS[button] : 0, clickCount: event.action === 'move' ? 0 : clickCount, modifiers },
      }]
    }
    case 'wheel': {
      const { x, y } = point(event, viewport)
      const deltaX = Number(event.deltaX ?? 0)
      const deltaY = Number(event.deltaY ?? 0)
      if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) throw invalid('wheel deltas must be numbers')
      return [{ method: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x, y, button: 'none', buttons: 0, clickCount: 0, deltaX, deltaY, modifiers } }]
    }
    case 'text': {
      if (typeof event.text !== 'string' || event.text.length === 0 || event.text.length > 10_000) throw invalid('text input is 1 to 10000 characters')
      return [{ method: 'Input.insertText', params: { text: event.text } }]
    }
    case 'key': {
      if (event.action !== 'down' && event.action !== 'up') throw invalid('key action is down or up')
      let canonical
      try {
        canonical = normalizeKey(event.key)
      } catch {
        return [] // keys without a descriptor (Dead, Process, Unidentified) are dropped: nothing to forward
      }
      const shift = (modifiers & MODIFIER_BITS.Shift) !== 0
      const descriptor = keyDescriptor(canonical, { shift })
      if (event.action === 'up') {
        const { text, ...fields } = descriptor
        void text
        return [{ method: 'Input.dispatchKeyEvent', params: { type: 'keyUp', ...fields, modifiers } }]
      }
      const meaning = chordMeaning(modifiers, canonical)
      if (meaning?.refuse !== undefined) throw new EnvironmentError('unsupported_action', meaning.refuse)
      if (meaning?.browser !== undefined) return [{ kind: 'navigate', direction: meaning.browser }]
      if (meaning?.clipboard !== undefined) return [{ kind: 'clipboard', op: meaning.clipboard }]
      const producesText = (modifiers & (MODIFIER_BITS.Control | MODIFIER_BITS.Meta | MODIFIER_BITS.Alt)) === 0 && descriptor.text !== undefined
      const { text, ...fields } = descriptor
      return [{
        method: 'Input.dispatchKeyEvent',
        params: {
          type: producesText ? 'keyDown' : 'rawKeyDown', ...fields, modifiers,
          ...(producesText ? { text, unmodifiedText: text } : {}),
          ...(meaning?.command !== undefined ? { commands: [meaning.command] } : {}),
        },
      }]
    }
    default:
      throw invalid(`unknown human input type '${String(event.type)}'`)
  }
}
