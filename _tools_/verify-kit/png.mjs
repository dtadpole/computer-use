/**
 * A dependency-free PNG reader for checks: enough to read a pixel of a Chrome screenshot (8-bit RGB or RGBA,
 * not interlaced, any of the five scanline filters). The perception check uses it to prove the model's image
 * shows a target exactly where a click on that frame point lands.
 */

import { crc32 as zlibCrc32, deflateSync as zlibDeflate, inflateSync } from 'node:zlib'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** The Paeth predictor of the PNG specification. */
export function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft
  const dLeft = Math.abs(estimate - left)
  const dUp = Math.abs(estimate - up)
  const dUpLeft = Math.abs(estimate - upLeft)
  if (dLeft <= dUp && dLeft <= dUpLeft) return left
  if (dUp <= dUpLeft) return up
  return upLeft
}

/** Decode a PNG into `{ width, height, channels, pixel(x, y) }`; throws on anything it does not support. */
export function decodePng(data) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'base64')
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG')
  let offset = 8
  let header
  const idat = []
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.toString('latin1', offset + 4, offset + 8)
    const body = bytes.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), depth: body[8], colorType: body[9], interlace: body[12] }
    } else if (type === 'IDAT') idat.push(body)
    else if (type === 'IEND') break
    offset += 12 + length
  }
  if (!header) throw new Error('the PNG has no IHDR')
  if (header.depth !== 8 || ![2, 6].includes(header.colorType) || header.interlace !== 0) {
    throw new Error(`unsupported PNG: depth ${header.depth}, colour type ${header.colorType}, interlace ${header.interlace}`)
  }
  const channels = header.colorType === 6 ? 4 : 3
  const stride = header.width * channels
  const raw = inflateSync(Buffer.concat(idat))
  if (raw.length !== (stride + 1) * header.height) throw new Error('the PNG image data has the wrong length')
  const pixels = Buffer.alloc(stride * header.height)
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const out = y * stride
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? pixels[out + i - channels] : 0
      const up = y > 0 ? pixels[out - stride + i] : 0
      const upLeft = y > 0 && i >= channels ? pixels[out - stride + i - channels] : 0
      let value
      if (filter === 0) value = line[i]
      else if (filter === 1) value = line[i] + left
      else if (filter === 2) value = line[i] + up
      else if (filter === 3) value = line[i] + ((left + up) >> 1)
      else if (filter === 4) value = line[i] + paeth(left, up, upLeft)
      else throw new Error(`unknown PNG filter ${filter} on row ${y}`)
      pixels[out + i] = value & 0xff
    }
  }
  return {
    width: header.width,
    height: header.height,
    channels,
    pixel(x, y) {
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= header.width || y >= header.height) throw new RangeError(`pixel (${x}, ${y}) is outside the image`)
      const at = y * stride + x * channels
      return channels === 4 ? [pixels[at], pixels[at + 1], pixels[at + 2], pixels[at + 3]] : [pixels[at], pixels[at + 1], pixels[at + 2], 255]
    },
  }
}

/**
 * A solid-colour 8-bit RGB PNG, for worlds whose apps are drawn as images (the helper's dry run). `rgb` is [r, g, b].
 */
export function solidPng(width, height, [r, g, b]) {
  const row = Buffer.alloc(1 + width * 3)
  for (let x = 0; x < width; x += 1) row.set([r, g, b], 1 + x * 3)
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlibCrc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlibDeflate(raw)), chunk('IEND', Buffer.alloc(0))])
}
