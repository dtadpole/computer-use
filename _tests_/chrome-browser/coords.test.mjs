import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  checkPoint, CLAUDE_IMAGE_LIMITS, deltaToViewport, fitScale, frameFor, pngSize, screenshotClip, tileCount, toFrame, toViewport,
} from '../../_environments_/chrome-browser/coords.mjs'
import { EnvironmentError } from '../../_environments_/chrome-browser/errors.mjs'

const refused = (error) => error instanceof EnvironmentError && error.code === 'invalid_argument'
const viewport = { width: 1440, height: 900 }

test('fitScale is 1 when the viewport already fits, and never upscales', () => {
  assert.equal(fitScale(viewport), 1)
  assert.equal(fitScale(viewport, { maxWidth: 4000, maxHeight: 4000 }), 1)
})

test('fitScale honours width, height, long edge and pixel limits', () => {
  assert.equal(fitScale(viewport, { maxWidth: 720 }), 0.5)
  assert.equal(fitScale(viewport, { maxHeight: 450 }), 0.5)
  assert.equal(fitScale(viewport, { maxLongEdge: 1280 }), 1280 / 1440)
  const pixels = fitScale(viewport, { maxPixels: 1_150_000 })
  const frame = frameFor(viewport, pixels)
  assert.ok(frame.width * frame.height <= 1_150_000, `${frame.width}x${frame.height}`)
  assert.ok(frame.width >= 1356, 'the pixel limit should not shrink far below what fits')
})

test('fitScale yields an image size within every limit after flooring', () => {
  for (const limits of [{ maxWidth: 1000 }, { maxHeight: 777 }, { maxLongEdge: 1568 }, { maxPixels: 640 * 480 }]) {
    const frame = frameFor(viewport, fitScale(viewport, limits))
    if (limits.maxWidth) assert.ok(frame.width <= limits.maxWidth)
    if (limits.maxHeight) assert.ok(frame.height <= limits.maxHeight)
    if (limits.maxLongEdge) assert.ok(Math.max(frame.width, frame.height) <= limits.maxLongEdge)
    if (limits.maxPixels) assert.ok(frame.width * frame.height <= limits.maxPixels)
  }
})

test('fitScale refuses bad viewports and unknown limits', () => {
  assert.throws(() => fitScale({ width: 0, height: 900 }), refused)
  assert.throws(() => fitScale({ width: 14.5, height: 900 }), refused)
  assert.throws(() => fitScale(viewport, { maxDepth: 3 }), refused)
  assert.throws(() => fitScale(viewport, { maxWidth: -1 }), refused)
})

test('a 2x downscale doubles model coordinates back into CSS pixels', () => {
  const frame = frameFor(viewport, 0.5)
  assert.equal(frame.width, 720)
  assert.equal(frame.height, 450)
  assert.deepEqual(toViewport({ x: 60, y: 35 }, frame), { x: 120, y: 70 })
  assert.deepEqual(toFrame({ x: 120, y: 70 }, frame), { x: 60, y: 35 })
})

test('per-axis scale follows the image Chrome actually returned', () => {
  const frame = frameFor(viewport, 1280 / 1440, { width: 1280, height: 801 })
  assert.equal(frame.scaleX, 1280 / 1440)
  assert.equal(frame.scaleY, 801 / 900)
  const back = toViewport({ x: 640, y: 400.5 }, frame)
  assert.ok(Math.abs(back.x - 720) < 1e-9)
  assert.ok(Math.abs(back.y - 450) < 1e-9)
})

test('scale 1 is the identity', () => {
  const frame = frameFor(viewport, 1)
  assert.deepEqual(toViewport({ x: 1439, y: 899 }, frame), { x: 1439, y: 899 })
})

test('points outside the frame or not numeric are refused, not clamped', () => {
  const frame = frameFor(viewport, 0.5)
  for (const point of [{ x: 720, y: 10 }, { x: 10, y: 450 }, { x: -1, y: 0 }, { x: '5', y: 5 }, { x: NaN, y: 1 }, {}, null]) {
    assert.throws(() => checkPoint(point, frame), refused, JSON.stringify(point))
  }
  assert.deepEqual(checkPoint({ x: 719.9, y: 0 }, frame), { x: 719.9, y: 0 })
})

test('scroll deltas scale like coordinates', () => {
  const frame = frameFor(viewport, 0.5)
  assert.deepEqual(deltaToViewport(0, 150, frame), { dx: 0, dy: 300 })
  assert.throws(() => deltaToViewport(0, Infinity, frame), refused)
})

test('screenshot clip: whole frame at the frame scale, zoom regions at viewport resolution', () => {
  const frame = frameFor(viewport, 0.5)
  assert.deepEqual(screenshotClip(frame), { x: 0, y: 0, width: 1440, height: 900, scale: 0.5 })
  assert.deepEqual(screenshotClip(frame, [50, 25, 70, 45]), { x: 100, y: 50, width: 40, height: 40, scale: 1 })
  assert.throws(() => screenshotClip(frame, [10, 10, 5, 20]), refused)
  assert.throws(() => screenshotClip(frame, [0, 0, 721, 10]), refused)
  assert.throws(() => screenshotClip(frame, [0, 0, 10]), refused)
})

test('pngSize reads IHDR and refuses non-PNG data', () => {
  const header = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0)
  header.writeUInt32BE(13, 8)
  header.write('IHDR', 12, 'latin1')
  header.writeUInt32BE(720, 16)
  header.writeUInt32BE(450, 20)
  assert.deepEqual(pngSize(header), { width: 720, height: 450 })
  assert.throws(() => pngSize(Buffer.from('GIF89a and more bytes here')), refused)
  assert.throws(() => pngSize('not a buffer'), refused)
})

test('tile counts match the gateway measurements in claude-images.md', () => {
  assert.equal(tileCount(2576, 1449, 28), 4784)
  assert.equal(tileCount(2400, 1800, 28), 5590)
  assert.equal(tileCount(1440, 900, 28), 52 * 33)
})

test('Claude limits leave 1440x900 alone and bring large viewports within every limit', () => {
  assert.equal(fitScale(viewport, CLAUDE_IMAGE_LIMITS), 1)
  for (const big of [{ width: 2560, height: 1600 }, { width: 3840, height: 2160 }, { width: 2600, height: 1300 }, { width: 1200, height: 4000 }]) {
    const frame = frameFor(big, fitScale(big, CLAUDE_IMAGE_LIMITS))
    assert.ok(Math.max(frame.width, frame.height) <= 2576, JSON.stringify(frame))
    assert.ok(frame.width <= 2000 && frame.height <= 2000, JSON.stringify(frame))
    assert.ok(tileCount(frame.width, frame.height, 28) <= 4784, JSON.stringify(frame))
  }
})

test('a tile limit alone shrinks only as far as the rounded-up tiles require', () => {
  const big = { width: 3000, height: 2000 }
  const scale = fitScale(big, { maxTiles: 4784, tileSize: 28 })
  const frame = frameFor(big, scale)
  assert.ok(tileCount(frame.width, frame.height, 28) <= 4784)
  const estimate = Math.sqrt((4784 * 28 * 28) / (3000 * 2000))
  assert.ok(scale < estimate, 'the continuous estimate overshoots here and must be corrected')
  assert.ok(frame.width >= Math.floor(3000 * estimate) - 60, `shrunk too far: ${frame.width}`)
  assert.throws(() => fitScale(big, { maxTiles: 4784 }), refused)
})
