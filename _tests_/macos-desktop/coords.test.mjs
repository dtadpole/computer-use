import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  captureMatchesFrame, checkPoint, deltaToPoints, displayFrame, fitFactor, frameFor, pngSize, rectToFrame, regionToGlobal, sizeAt, tileCount,
  toFrame, toGlobal,
} from '../../_environments_/macos-desktop/coords.mjs'
import { EnvironmentError } from '../../_environments_/macos-desktop/errors.mjs'
import { makePng } from './png.mjs'

const refused = (error) => error instanceof EnvironmentError && error.code === 'invalid_argument'
const CLAUDE = { maxLongEdge: 2576, maxTiles: 4784, tileSize: 28 }

test("scale 1: the owner's 1920x1080 display fits Claude's limits below its own size, never above", () => {
  const factor = fitFactor({ width: 1920, height: 1080 }, 1, CLAUDE)
  const size = sizeAt({ width: 1920, height: 1080 }, factor)
  assert.equal(factor <= 1, true)
  assert.equal(tileCount(size.width, size.height, 28) <= 4784, true)
  assert.equal(Math.max(size.width, size.height) <= 2576, true)
  assert.equal(fitFactor({ width: 800, height: 600 }, 1, CLAUDE), 1, 'a small display is not upscaled')
})

test('scale 2: a Retina display is captured at most at its pixel size, usually below it', () => {
  assert.equal(fitFactor({ width: 400, height: 300 }, 2, {}), 2)
  const factor = fitFactor({ width: 1512, height: 982 }, 2, CLAUDE)
  assert.equal(factor < 2, true)
  const size = sizeAt({ width: 1512, height: 982 }, factor)
  assert.equal(tileCount(size.width, size.height, 28) <= 4784, true)
  assert.equal(fitFactor({ width: 1000, height: 500 }, 2, { maxWidth: 1000 }), 1)
})

test('limits are checked by name and value', () => {
  assert.throws(() => fitFactor({ width: 10, height: 10 }, 1, { maxSide: 5 }), refused)
  assert.throws(() => fitFactor({ width: 10, height: 10 }, 1, { maxTiles: 5 }), refused)
  assert.throws(() => fitFactor({ width: 10, height: 10 }, 0, {}), refused)
  assert.throws(() => fitFactor({ width: 0, height: 10 }, 1, {}), refused)
})

test('scale 1 mapping: frame pixels are global points offset by the display origin', () => {
  const frame = frameFor({ display: 2, originPt: { x: 1920, y: 0 }, sizePt: { width: 1920, height: 1080 }, scale: 1 }, 1)
  assert.equal(frame.width, 1920)
  assert.deepEqual(toGlobal({ x: 10, y: 20 }, frame), { x: 1930, y: 20 })
  assert.deepEqual(toFrame({ x: 1930, y: 20 }, frame), { x: 10, y: 20 })
  assert.equal(frame.display, 2)
  assert.deepEqual(frame.viewport, { width: 1920, height: 1080 })
})

test('scale 2 mapping: a Retina frame at its pixel size halves into points; a reduced frame maps per axis', () => {
  const retina = frameFor({ originPt: { x: 0, y: 0 }, sizePt: { width: 400, height: 300 }, scale: 2 }, 2, { width: 800, height: 600 })
  assert.equal(retina.scaleX, 2)
  assert.deepEqual(toGlobal({ x: 101, y: 599 }, retina), { x: 51, y: 300 }, 'rounded to the nearest point')
  assert.deepEqual(toGlobal({ x: 100, y: 598 }, retina), { x: 50, y: 299 })
  const reduced = frameFor({ originPt: { x: -1512, y: 0 }, sizePt: { width: 1512, height: 982 }, scale: 2 }, 1.3, { width: 1965, height: 1276 })
  assert.equal(reduced.scaleX, 1965 / 1512)
  assert.equal(reduced.scaleY, 1276 / 982)
  assert.deepEqual(toGlobal({ x: 1964, y: 1275 }, reduced), { x: -1, y: 981 })
  assert.equal(reduced.devicePixelRatio, 2)
})

test('out-of-frame points are refused, never clamped', () => {
  const frame = frameFor({ originPt: { x: 0, y: 0 }, sizePt: { width: 400, height: 300 }, scale: 2 }, 2)
  for (const point of [{ x: -1, y: 0 }, { x: 800, y: 0 }, { x: 0, y: 600 }, { x: Number.NaN, y: 1 }, { x: '1', y: 1 }, null]) {
    assert.throws(() => toGlobal(point, frame), refused, JSON.stringify(point))
  }
  assert.doesNotThrow(() => checkPoint({ x: 799, y: 599 }, frame))
  assert.throws(() => frameFor({ originPt: { x: 0, y: 0 }, sizePt: { width: 4, height: 3 }, scale: 1 }, 2), refused, 'factor above scale')
})

test('zoom regions widen outward to whole points; scroll deltas keep a small scroll', () => {
  const frame = frameFor({ originPt: { x: 100, y: 50 }, sizePt: { width: 400, height: 300 }, scale: 2 }, 2)
  assert.deepEqual(regionToGlobal([1, 1, 199, 101], frame), { x: 100, y: 50, width: 100, height: 51 })
  assert.throws(() => regionToGlobal([0, 0, 801, 10], frame), refused)
  assert.throws(() => regionToGlobal([10, 10, 10, 20], frame), refused)
  assert.throws(() => regionToGlobal([0, 0, 1], frame), refused)
  assert.deepEqual(deltaToPoints(0, 200, frame), { dx: 0, dy: 100 })
  assert.deepEqual(deltaToPoints(-1, 1, frame), { dx: -1, dy: 1 })
  assert.throws(() => deltaToPoints(Number.POSITIVE_INFINITY, 0, frame), refused)
  assert.deepEqual(rectToFrame({ x: 110, y: 60, width: 10, height: 5 }, frame), { x: 20, y: 20, width: 20, height: 10 })
  assert.equal(rectToFrame(null, frame), null)
})

test('displayFrame: a hello display fitted as its capture will be, before any capture; captureMatchesFrame checks a capture against it', () => {
  const display = { id: 4, main: true, originPt: { x: -1512, y: 0 }, sizePt: { width: 1512, height: 982 }, scale: 2 }
  const frame = displayFrame(display, CLAUDE)
  const factor = fitFactor(display.sizePt, 2, CLAUDE)
  assert.deepEqual(frame, frameFor({ display: 4, originPt: display.originPt, sizePt: display.sizePt, scale: 2 }, factor))
  assert.deepEqual({ width: frame.width, height: frame.height }, sizeAt(display.sizePt, factor), 'the size the first capture is asked for')
  assert.equal(tileCount(frame.width, frame.height, 28) <= 4784, true)
  assert.deepEqual([frame.devicePixelRatio, frame.display], [2, 4])
  // The simulateScale seam: a scale-1 display rendered at 2.
  const simulated = displayFrame({ ...display, sizePt: { width: 400, height: 300 }, scale: 1 }, {}, 2)
  assert.deepEqual([simulated.width, simulated.height, simulated.scaleX, simulated.devicePixelRatio], [800, 600, 2, 2])
  assert.throws(() => displayFrame(null, {}), refused)
  assert.throws(() => displayFrame(display, { maxSide: 5 }), refused)

  const shot = { display: 4, originPt: { ...display.originPt }, sizePt: { ...display.sizePt }, scale: 2, width: frame.width, height: frame.height }
  assert.equal(captureMatchesFrame(shot, frame), true)
  for (const changed of [{ display: 5 }, { scale: 1 }, { originPt: { x: 0, y: 0 } }, { sizePt: { width: 1612, height: 982 } }, { width: frame.width - 1 }, { height: frame.height + 1 }, { display: undefined }]) {
    assert.equal(captureMatchesFrame({ ...shot, ...changed }, frame), false, JSON.stringify(changed))
  }
})

test('PNG sizes are read from the image itself', () => {
  assert.deepEqual(pngSize(makePng(7, 3)), { width: 7, height: 3 })
  assert.throws(() => pngSize(Buffer.from('not a png at all, really not')), refused)
})
