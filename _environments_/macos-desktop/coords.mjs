import { invalid } from './errors.mjs'

/**
 * Coordinate spaces (design: desktop-extension/capture-and-scaling.md).
 *
 * - **frame**: pixels of the image the model sees; every action and target in agent core is in frame pixels.
 * - **capture**: pixels ScreenCaptureKit can return; `scale` is the display's backing scale factor (2 on Retina).
 * - **global**: points of the macOS global display space, origin top-left of the main display; helper input and
 *   accessibility speak only this.
 *
 * The driver asks for a capture no larger than the adapter's image limits: the display's point size times the largest
 * factor that fits, never above `scale`. So `frameScale` (frame px per point) is at most `scale`, usually below it on
 * Retina. A frame point maps to global points as `originPt + (x / scaleX, y / scaleY)`, rounded to the nearest point.
 * The scale is kept per axis and taken from the image the helper actually returned, because flooring each side of a
 * fractional size skews the two axes differently (the browser driver measured the same with Chrome).
 *
 * Out-of-frame points are refused, never clamped: a clamped click lands on something the model did not choose.
 */

const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0
const finite = (value) => typeof value === 'number' && Number.isFinite(value)

const LIMIT_NAMES = new Set(['maxWidth', 'maxHeight', 'maxLongEdge', 'maxPixels', 'maxTiles', 'tileSize'])

function checkSize(size, what) {
  if (!positive(size?.width) || !positive(size?.height)) throw invalid(`${what} needs positive width and height`)
}

/** Image tokens of a `width` x `height` image cut into `tileSize` squares (Claude's accounting). */
export function tileCount(width, height, tileSize) {
  return Math.ceil(width / tileSize) * Math.ceil(height / tileSize)
}

/** The frame size a point size yields at a factor (px per point): each side floored, at least 1. */
export function sizeAt(sizePt, factor) {
  return {
    width: Math.max(1, Math.floor(sizePt.width * factor + 1e-9)),
    height: Math.max(1, Math.floor(sizePt.height * factor + 1e-9)),
  }
}

/**
 * The largest factor (frame px per point), at most the display's `scale`, at which an area of `sizePt` points fits
 * every given image limit. Limits are the adapter's `maxImage`, any subset of `maxWidth`, `maxHeight`, `maxLongEdge`,
 * `maxPixels`, and `maxTiles` with `tileSize`; an absent limit does not constrain. Never upscales past the display's
 * own pixels: a Retina capture is never larger than the Retina pixel size.
 */
export function fitFactor(sizePt, scale, limits = {}) {
  checkSize(sizePt, 'a display or region')
  if (!positive(scale)) throw invalid('a display scale must be a positive number')
  for (const [name, value] of Object.entries(limits ?? {})) {
    if (!LIMIT_NAMES.has(name)) throw invalid(`unknown image limit '${name}'`)
    if (value !== undefined && value !== null && !positive(value)) throw invalid(`the image limit ${name} must be a positive number`)
  }
  const { maxWidth, maxHeight, maxLongEdge, maxPixels, maxTiles, tileSize } = limits ?? {}
  if ((maxTiles == null) !== (tileSize == null)) throw invalid('maxTiles and tileSize are given together')
  const { width, height } = sizePt
  const candidates = [scale]
  if (maxWidth != null) candidates.push(maxWidth / width)
  if (maxHeight != null) candidates.push(maxHeight / height)
  if (maxLongEdge != null) candidates.push(maxLongEdge / Math.max(width, height))
  if (maxPixels != null) candidates.push(Math.sqrt(maxPixels / (width * height)))
  if (maxTiles != null) candidates.push(Math.sqrt((maxTiles * tileSize * tileSize) / (width * height)))
  let factor = Math.min(...candidates)
  // Tiles round up per side, so the continuous estimate can overshoot by a row or column: shrink one pixel of width
  // at a time until the floored size fits. Every other limit is monotone and already holds.
  if (maxTiles != null) {
    for (let guard = 0; guard < width * scale; guard += 1) {
      const size = sizeAt(sizePt, factor)
      if (tileCount(size.width, size.height, tileSize) <= maxTiles) break
      factor = (size.width - 1) / width
    }
  }
  return factor
}

/**
 * The frame of one capture: built from what the helper reported (`display`, `originPt`, `sizePt`, `scale`) and the
 * image size it actually returned. `viewport` is the captured area in points, the space actions land in, so the member
 * shape matches the browser's frame; `devicePixelRatio` is the display's backing scale.
 */
export function frameFor({ display = null, originPt, sizePt, scale }, factor, imageSize) {
  if (!finite(originPt?.x) || !finite(originPt?.y)) throw invalid('a capture needs a finite originPt')
  checkSize(sizePt, 'a capture')
  if (!positive(scale)) throw invalid('a capture needs a positive scale')
  if (!positive(factor) || factor > scale + 1e-9) throw invalid('a frame factor must be in (0, scale]')
  const { width, height } = imageSize ?? sizeAt(sizePt, factor)
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw invalid('an image size needs positive integer width and height')
  return Object.freeze({
    width,
    height,
    scale: factor,
    scaleX: width / sizePt.width,
    scaleY: height / sizePt.height,
    originPt: Object.freeze({ x: originPt.x, y: originPt.y }),
    sizePt: Object.freeze({ width: sizePt.width, height: sizePt.height }),
    viewport: Object.freeze({ width: sizePt.width, height: sizePt.height }),
    devicePixelRatio: scale,
    display,
  })
}

/**
 * The frame a full capture of one hello display (`id`, `originPt`, `sizePt`, `scale`) will have under the adapter's
 * image limits, known before anything is captured. It is the fit and the floored size the driver asks the first
 * capture for, and the helper returns exactly that size (each axis its own pixels at `scale`, clamped to `maxSize`:
 * Dispatcher.swift `captureSize`, and the fake's same rule), so agent core can read the run's frame at launch and the
 * first capture only has to confirm it. `scale` is the backing scale the capture renders at: the display's own, or the
 * simulateScale seam's.
 */
export function displayFrame(display, limits = {}, scale = display?.scale) {
  if (display === null || typeof display !== 'object') throw invalid('a display frame needs a display')
  const factor = fitFactor(display.sizePt, scale, limits)
  return frameFor({ display: display.id ?? null, originPt: display.originPt, sizePt: display.sizePt, scale }, factor)
}

const near = (a, b) => finite(a) && finite(b) && Math.abs(a - b) < 1e-6

/**
 * Whether a full capture, as the helper reported it (`display`, `originPt`, `sizePt`, `scale`) with the size of the
 * image it returned (`width`, `height`), is a capture of `frame`: the same display, geometry, backing scale and pixel
 * size. Anything else is `display_changed` - one display per run and the frame fixed for it, never a silent remap
 * (capture-and-scaling.md) - whether it is the first capture checking the frame known at launch or a later one.
 */
export function captureMatchesFrame(shot, frame) {
  return shot?.display === frame.display && near(shot.scale, frame.devicePixelRatio)
    && near(shot.originPt?.x, frame.originPt.x) && near(shot.originPt?.y, frame.originPt.y)
    && near(shot.sizePt?.width, frame.sizePt.width) && near(shot.sizePt?.height, frame.sizePt.height)
    && shot.width === frame.width && shot.height === frame.height
}

/** Refuse a point that is not inside the frame; return it unchanged when it is. */
export function checkPoint(point, frame, field = 'point') {
  const { x, y } = point ?? {}
  if (!finite(x) || !finite(y)) throw invalid(`${field} needs numeric x and y`)
  if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) {
    throw invalid(`${field} (${x}, ${y}) is outside the ${frame.width}x${frame.height} screenshot`)
  }
  return point
}

/** Frame pixels to global points, rounded to the nearest point; out-of-frame points are refused. */
export function toGlobal(point, frame, field = 'point') {
  checkPoint(point, frame, field)
  return {
    x: Math.round(frame.originPt.x + point.x / frame.scaleX),
    y: Math.round(frame.originPt.y + point.y / frame.scaleY),
  }
}

/** Global points to frame pixels (for target boxes and checks); not rounded, not range-checked. */
export function toFrame(point, frame) {
  return { x: (point.x - frame.originPt.x) * frame.scaleX, y: (point.y - frame.originPt.y) * frame.scaleY }
}

/** An accessibility frame `{ x, y, width, height }` in global points as a box in frame pixels, or null. */
export function rectToFrame(rect, frame) {
  if (rect === null || rect === undefined || ![rect.x, rect.y, rect.width, rect.height].every(finite)) return null
  const topLeft = toFrame({ x: rect.x, y: rect.y }, frame)
  return { x: topLeft.x, y: topLeft.y, width: rect.width * frame.scaleX, height: rect.height * frame.scaleY }
}

/**
 * A scroll distance in frame pixels as whole points per axis; the helper posts it as a pixel-unit wheel event. A
 * non-zero distance never rounds to nothing, so a small scroll the model asked for still scrolls.
 */
export function deltaToPoints(dx, dy, frame) {
  for (const [name, value] of [['scroll_x', dx], ['scroll_y', dy]]) {
    if (!finite(value)) throw invalid(`${name} must be a finite number`)
  }
  const whole = (value, perPoint) => {
    if (value === 0) return 0
    const points = Math.round(value / perPoint)
    return points === 0 ? Math.sign(value) : points
  }
  return { dx: whole(dx, frame.scaleX), dy: whole(dy, frame.scaleY) }
}

/**
 * A zoom region `[left, top, right, bottom]` in frame pixels as a global rectangle in whole points, widened outward
 * to the point grid so the zoom never loses an edge the model asked for. Later coordinates stay in full-frame space.
 */
export function regionToGlobal(region, frame) {
  if (!Array.isArray(region) || region.length !== 4 || !region.every(finite)) {
    throw invalid('a zoom region is [left, top, right, bottom] in screenshot pixels')
  }
  const [left, top, right, bottom] = region
  if (left < 0 || top < 0 || right > frame.width || bottom > frame.height || right <= left || bottom <= top) {
    throw invalid(`the zoom region [${region.join(', ')}] is empty or outside the ${frame.width}x${frame.height} screenshot`)
  }
  const x0 = Math.floor(frame.originPt.x + left / frame.scaleX)
  const y0 = Math.floor(frame.originPt.y + top / frame.scaleY)
  const x1 = Math.ceil(frame.originPt.x + right / frame.scaleX - 1e-9)
  const y1 = Math.ceil(frame.originPt.y + bottom / frame.scaleY - 1e-9)
  return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) }
}

/** Width and height from a PNG's IHDR chunk, so the frame is built from the image the helper returned. */
export function pngSize(buffer) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (!Buffer.isBuffer(buffer) || buffer.length < 24 || !signature.every((byte, i) => buffer[i] === byte)) {
    throw invalid('the image is not a PNG')
  }
  if (buffer.toString('latin1', 12, 16) !== 'IHDR') throw invalid('the PNG has no IHDR chunk first')
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}
