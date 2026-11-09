import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import { describe, test } from 'node:test'

import { bySource, filesHolding, heldKeyOrder, isMarker, landedOn, landings, markerShare, pngsWithMarker, stuckInput, SYNTHETIC_TAG, taggedAfter } from '../../_tools_/verify-kit/desktop-evidence.mjs'

/** A tiny RGBA PNG filled with one colour (test data only). */
function solidPng(width, height, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (buf) => { let c = 0xffffffff; for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([len, body, sum]) }
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b, 255]).flat())])
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))), chunk('IEND', Buffer.alloc(0))])
}

const target = { window: 'main', x: 37, y: 41, width: 23, height: 19, cx: 48.5, cy: 50.5 }
const press = (x, y, extra = {}) => ({ kind: 'mouseDown', window: 'main', x, y, t: 10, pid: 77, tag: 5, ...extra })

describe('landing points', () => {
  test('one press within a point of the centre lands; off-target, off-centre or doubled does not', () => {
    assert.equal(landedOn([press(48.5, 50.5), { kind: 'mouseUp', window: 'main', x: 48.5, y: 50.5 }], target), true)
    assert.equal(landedOn([press(49.4, 51.4)], target), true)
    assert.equal(landedOn([press(50.5, 50.5)], target), false, 'two points off centre')
    assert.equal(landedOn([press(48.5, 50.5), press(48.5, 50.5)], target), false, 'two presses')
    assert.equal(landedOn([press(48.5, 50.5, { window: 'details' })], target), false, 'another window')
    assert.equal(landings([press(10, 10)], target)[0].inside, false)
  })
})

describe('event sources', () => {
  test('synthetic events are told apart by pid and tag; a pause keeps tagged events at zero', () => {
    const input = [press(1, 1), press(2, 2, { pid: 77, tag: 0 }), press(3, 3, { pid: 12, tag: 5 }), press(4, 4, { t: 20 })]
    const { synthetic, other } = bySource(input, { pid: 77, tag: 5 })
    assert.equal(synthetic.length, 2)
    assert.equal(other.length, 2)
    assert.deepEqual(taggedAfter(input, 15, 5).map((e) => e.x), [4])
  })
})

describe('marker colour and run files', () => {
  test('the marker matcher tolerates a display profile shift but not other colours', () => {
    assert.equal(isMarker([255, 0, 255]), true)
    assert.equal(isMarker([255, 64, 255]), true, 'calibrated-to-sRGB shift')
    assert.equal(isMarker([255, 255, 255]), false)
    assert.equal(isMarker([200, 0, 200]), false)
  })

  test('marker PNGs, held strings and undecodable PNGs are all found in a run directory', () => {
    const dir = mkdtempSync('/tmp/cu-verifier-evidence-test-')
    try {
      mkdirSync(join(dir, 'screenshots'))
      writeFileSync(join(dir, 'screenshots', 'step-0001.png'), solidPng(16, 16, [255, 255, 255]))
      writeFileSync(join(dir, 'screenshots', 'step-0002.png'), solidPng(16, 16, [255, 0, 255]))
      writeFileSync(join(dir, 'screenshots', 'broken.png'), Buffer.from('not a png'))
      writeFileSync(join(dir, 'events.jsonl'), '{"text":"hello SECRET-91Z"}\n')
      assert.equal(markerShare(solidPng(8, 8, [255, 0, 255])), 1)
      const found = pngsWithMarker(dir)
      assert.deepEqual(found.map((f) => f.path.split('/').pop()).sort(), ['broken.png', 'step-0002.png'])
      assert.deepEqual(filesHolding(dir, 'SECRET-91Z').map((p) => p.split('/').pop()), ['events.jsonl'])
      assert.deepEqual(filesHolding(dir, 'ABSENT'), [])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('the design\'s synthetic tag', () => {
  test('is CUSE, and is the default for source and pause checks', () => {
    assert.equal(SYNTHETIC_TAG, Buffer.from('CUSE').readUInt32BE(0))
    const input = [{ kind: 'mouseDown', pid: 9, tag: SYNTHETIC_TAG, t: 5 }, { kind: 'mouseDown', pid: 9, tag: 0, t: 6 }]
    assert.equal(bySource(input, { pid: 9 }).synthetic.length, 1)
    assert.equal(taggedAfter(input, 4).length, 1)
  })
})

describe('every down has its up (D-028, R86)', () => {
  const T = SYNTHETIC_TAG
  test('balanced clicks, keys and modifiers are clean', () => {
    const input = [
      { kind: 'flagsChanged', modifiers: 1048576, tag: T }, { kind: 'mouseDown', button: 0, tag: T }, { kind: 'mouseUp', button: 0, tag: T },
      { kind: 'keyDown', keyCode: 40, tag: T }, { kind: 'keyDown', keyCode: 40, repeat: true, tag: T }, { kind: 'keyUp', keyCode: 40, tag: T }, { kind: 'flagsChanged', modifiers: 0, tag: T },
    ]
    assert.equal(stuckInput(input).clean, true)
  })

  test('a held button, key or modifier is reported; a person\'s events are ignored unless asked', () => {
    assert.equal(stuckInput([{ kind: 'mouseDown', button: 0, tag: T }]).buttons.length, 1)
    assert.equal(stuckInput([{ kind: 'rightMouseDown', button: 1, tag: T }, { kind: 'mouseUp', button: 0, tag: T }]).clean, false, 'a left up does not release a right down')
    assert.equal(stuckInput([{ kind: 'keyDown', keyCode: 12, tag: T }]).keys.length, 1)
    assert.equal(stuckInput([{ kind: 'flagsChanged', modifiers: 131072, tag: T }]).modifiers, 131072)
    assert.equal(stuckInput([{ kind: 'mouseDown', button: 0, tag: 0 }]).clean, true, 'the person\'s own press is not the agent\'s')
    assert.equal(stuckInput([{ kind: 'mouseDown', button: 0, tag: 0 }], { tag: null }).clean, false)
  })
})

describe('the owner\'s press during a hold (CU-341 Part 2, G2)', () => {
  const T = SYNTHETIC_TAG
  test('a held key comes up after the person\'s key and nothing tagged follows: ok', () => {
    const input = [
      { kind: 'keyDown', keyCode: 0, t: 10.0, tag: T },
      { kind: 'keyDown', keyCode: 0, t: 10.5, tag: T, repeat: true },
      { kind: 'keyDown', keyCode: 49, t: 12.0, tag: 0 },
      { kind: 'keyUp', keyCode: 0, t: 12.02, tag: T },
      { kind: 'keyUp', keyCode: 49, t: 12.1, tag: 0 },
    ]
    const order = heldKeyOrder(input, { since: 11 })
    assert.equal(order.ok, true)
    assert.deepEqual(order.held, [{ keyCode: 0, downAt: 10.0, upAt: 12.02 }])
    assert.deepEqual(order.press, { t: 12.0, kind: 'keyDown', index: 2 })
    assert.equal(JSON.stringify(order.press).includes('49'), false, 'the person\'s key code is not reported')
  })
  test('a held modifier is cleared by a tagged flags change after the press', () => {
    const input = [
      { kind: 'flagsChanged', modifiers: 0x20000, t: 5, tag: T },
      { kind: 'keyDown', keyCode: 49, t: 6, tag: 0 },
      { kind: 'flagsChanged', modifiers: 0, t: 6.01, tag: T },
    ]
    const order = heldKeyOrder(input)
    assert.equal(order.ok, true)
    assert.deepEqual(order.modifiers, { atPress: 0x20000, clearedAt: 6.01 })
  })
  test('a key left down, a tagged event after the press, no press, or nothing held is not ok', () => {
    const held = { kind: 'keyDown', keyCode: 0, t: 1, tag: T }
    const press = { kind: 'keyDown', keyCode: 49, t: 2, tag: 0 }
    const stuck = heldKeyOrder([held, press])
    assert.equal(stuck.ok, false)
    assert.equal(stuck.held[0].upAt, null)
    const more = heldKeyOrder([held, press, { kind: 'keyUp', keyCode: 0, t: 2.01, tag: T }, { kind: 'mouseDown', button: 0, t: 2.5, tag: T }])
    assert.equal(more.ok, false)
    assert.equal(more.after.length, 1, 'a synthetic click after the press is what the pause forbids')
    assert.equal(heldKeyOrder([held, { kind: 'keyUp', keyCode: 0, t: 3, tag: T }]).press, null)
    assert.equal(heldKeyOrder([press, { kind: 'keyUp', keyCode: 49, t: 2.1, tag: 0 }]).ok, false, 'nothing was held')
  })
})
