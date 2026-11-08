import assert from 'node:assert/strict'
import { crc32, deflateSync } from 'node:zlib'
import { describe, test } from 'node:test'

import { decodePng, paeth, solidPng } from '../../_tools_/verify-kit/png.mjs'

/** A minimal PNG encoder for the round trip: each row uses `filters[row % filters.length]`. */
function encodePng({ width, height, channels, pixel, filters = [0], colorType = channels === 4 ? 6 : 2, depth = 8 }) {
  const stride = width * channels
  const rows = []
  const prior = Buffer.alloc(stride)
  for (let y = 0; y < height; y += 1) {
    const line = Buffer.alloc(stride)
    for (let x = 0; x < width; x += 1) pixel(x, y).slice(0, channels).forEach((value, c) => (line[x * channels + c] = value))
    const filter = filters[y % filters.length]
    const out = Buffer.alloc(stride + 1)
    out[0] = filter
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? line[i - channels] : 0
      const up = y > 0 ? prior[i] : 0
      const upLeft = y > 0 && i >= channels ? prior[i - channels] : 0
      const predict = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter]
      out[i + 1] = (line[i] - predict) & 0xff
    }
    rows.push(out)
    line.copy(prior)
  }
  const chunk = (type, body) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(body.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'latin1'), body])))
    return Buffer.concat([length, Buffer.from(type, 'latin1'), body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = depth
  ihdr[9] = colorType
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))])
}

const colour = (x, y) => [(x * 37 + y * 11) & 0xff, (x * 5 + y * 91) & 0xff, (x * y) & 0xff, 200 + ((x + y) % 50)]

describe('decodePng', () => {
  test('round-trips RGBA through every scanline filter', () => {
    const png = encodePng({ width: 13, height: 10, channels: 4, pixel: colour, filters: [0, 1, 2, 3, 4] })
    const image = decodePng(png)
    assert.deepEqual([image.width, image.height, image.channels], [13, 10, 4])
    for (let y = 0; y < 10; y += 1) for (let x = 0; x < 13; x += 1) assert.deepEqual(image.pixel(x, y), colour(x, y), `${x},${y}`)
  })

  test('round-trips RGB and reports full alpha', () => {
    const image = decodePng(encodePng({ width: 7, height: 5, channels: 3, pixel: colour, filters: [4, 3, 2, 1, 0] }))
    assert.deepEqual(image.pixel(6, 4), [...colour(6, 4).slice(0, 3), 255])
  })

  test('accepts base64 and refuses what it cannot read', () => {
    const png = encodePng({ width: 2, height: 2, channels: 3, pixel: colour })
    assert.deepEqual(decodePng(png.toString('base64')).pixel(1, 1), [...colour(1, 1).slice(0, 3), 255])
    assert.throws(() => decodePng(Buffer.from('not a png at all')), /not a PNG/)
    assert.throws(() => decodePng(encodePng({ width: 2, height: 2, channels: 3, pixel: colour, depth: 16 })), /unsupported PNG/)
    assert.throws(() => decodePng(png).pixel(2, 0), /outside the image/)
    assert.throws(() => decodePng(png).pixel(0.5, 0), /outside the image/)
  })

  test('paeth follows the specification ties', () => {
    assert.equal(paeth(10, 10, 10), 10)
    assert.equal(paeth(1, 200, 1), 200)
    assert.equal(paeth(200, 1, 1), 200)
    assert.equal(paeth(5, 9, 9), 5)
  })
})

test('solidPng writes a PNG that decodePng reads back, every pixel the colour asked for', () => {
  const image = decodePng(solidPng(7, 3, [255, 0, 255]))
  assert.deepEqual([image.width, image.height], [7, 3])
  for (let y = 0; y < 3; y += 1) for (let x = 0; x < 7; x += 1) assert.deepEqual(image.pixel(x, y).slice(0, 3), [255, 0, 255])
})
