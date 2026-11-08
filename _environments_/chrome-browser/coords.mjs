import { invalid } from './errors.mjs'

/**
 * Coordinate spaces.
 *
 * The **viewport** is the page in CSS pixels; the device scale factor is pinned to 1, so a CSS pixel is a
 * screenshot pixel at scale 1 (measured: `devicePixelRatio` 1, 1440x900 viewport gives a 1440x900 image). The
 * **frame** is the image the model sees, possibly downscaled with `Page.captureScreenshot`'s `clip.scale`. The
 * model's coordinates are frame pixels; the environment divides by the per-axis scale before acting.
 *
 * The scale is kept **per axis** and is taken from the image actually captured, because Chrome rounds the
 * output size of a fractional scale and a single scalar would be off by up to a pixel along one axis.
 */

const positive = (value) => Number.isFinite(value) && value > 0

function checkViewport(viewport) {
  if (!positive(viewport?.width) || !positive(viewport?.height) || !Number.isInteger(viewport.width) || !Number.isInteger(viewport.height)) {
    throw invalid('a viewport needs positive integer width and height')
  }
}

/**
 * Claude's limits through the gateway, measured on model-a (a local-config alias) and claude-sonnet-5-5
 * (`_context_/model-capabilities/claude-images.md`): a tool-result image over 2,576 px on its long edge or over
 * 4,784 image tokens of 28x28 px is refused with a 400, not downscaled; at most 2,000 px per side is advised once a
 * request holds more than 20 images. The adapter owns which limits apply; this preset saves restating them.
 */
export const CLAUDE_IMAGE_LIMITS = Object.freeze({ maxLongEdge: 2576, maxTiles: 4784, tileSize: 28, maxWidth: 2000, maxHeight: 2000 })

/** Image tokens of a `width` x `height` image cut into `tileSize` squares. */
export function tileCount(width, height, tileSize) {
  return Math.ceil(width / tileSize) * Math.ceil(height / tileSize)
}

const LIMIT_NAMES = new Set(['maxWidth', 'maxHeight', 'maxLongEdge', 'maxPixels', 'maxTiles', 'tileSize'])

/**
 * The largest scale, at most 1, at which the viewport's image fits every given limit.
 *
 * `limits` may hold `maxWidth`, `maxHeight`, `maxLongEdge` (pixels), `maxPixels` (width times height), and
 * `maxTiles` with its `tileSize` (`ceil(w / tile) * ceil(h / tile)`, Claude's image tokens); an absent limit does
 * not constrain. The image is never upscaled. Sizes are judged after `frameFor` floors each side.
 */
export function fitScale(viewport, limits = {}) {
  checkViewport(viewport)
  const { width, height } = viewport
  for (const [name, value] of Object.entries(limits)) {
    if (!LIMIT_NAMES.has(name)) throw invalid(`unknown image limit '${name}'`)
    if (value !== undefined && value !== null && !positive(value)) throw invalid(`the image limit ${name} must be a positive number`)
  }
  const { maxWidth, maxHeight, maxLongEdge, maxPixels, maxTiles, tileSize } = limits
  if ((maxTiles == null) !== (tileSize == null)) throw invalid('maxTiles and tileSize are given together')
  const candidates = [1]
  if (maxWidth != null) candidates.push(maxWidth / width)
  if (maxHeight != null) candidates.push(maxHeight / height)
  if (maxLongEdge != null) candidates.push(maxLongEdge / Math.max(width, height))
  if (maxPixels != null) candidates.push(Math.sqrt(maxPixels / (width * height)))
  if (maxTiles != null) candidates.push(Math.sqrt((maxTiles * tileSize * tileSize) / (width * height)))
  let scale = Math.min(...candidates)
  // Tiles round up per side, so the continuous estimate can overshoot by a row or column: shrink one pixel of
  // width at a time until the floored frame fits. Every other limit is monotone and already holds.
  if (maxTiles != null) {
    for (let guard = 0; guard < width; guard += 1) {
      const frame = frameFor(viewport, scale)
      if (tileCount(frame.width, frame.height, tileSize) <= maxTiles) break
      scale = (frame.width - 1) / width
    }
  }
  // How Chrome rounds a fractional clip.scale is measured at launch: the frame is rebuilt from the returned image.
  return scale
}

/** The frame a viewport yields at a scale, or at the image size Chrome actually returned. */
export function frameFor(viewport, scale, imageSize = undefined) {
  checkViewport(viewport)
  if (!positive(scale) || scale > 1) throw invalid('a frame scale must be in (0, 1]')
  const width = imageSize?.width ?? Math.max(1, Math.floor(viewport.width * scale + 1e-9))
  const height = imageSize?.height ?? Math.max(1, Math.floor(viewport.height * scale + 1e-9))
  if (!positive(width) || !positive(height)) throw invalid('an image size needs positive width and height')
  return Object.freeze({
    width,
    height,
    scale,
    scaleX: width / viewport.width,
    scaleY: height / viewport.height,
    viewport: Object.freeze({ width: viewport.width, height: viewport.height }),
    devicePixelRatio: 1,
  })
}

/** Refuse a point that is not inside the frame; return it unchanged when it is. */
export function checkPoint(point, frame, field = 'point') {
  const { x, y } = point ?? {}
  if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
    throw invalid(`${field} needs numeric x and y`)
  }
  if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) {
    throw invalid(`${field} (${x}, ${y}) is outside the ${frame.width}x${frame.height} screenshot`)
  }
  return point
}

/** Frame pixels to viewport CSS pixels. */
export function toViewport(point, frame) {
  checkPoint(point, frame)
  return { x: point.x / frame.scaleX, y: point.y / frame.scaleY }
}

/** Viewport CSS pixels to frame pixels (for overlays and checks). */
export function toFrame(point, frame) {
  return { x: point.x * frame.scaleX, y: point.y * frame.scaleY }
}

/** A scroll distance in frame pixels to CSS pixels. */
export function deltaToViewport(dx, dy, frame) {
  for (const [name, value] of [['scroll_x', dx], ['scroll_y', dy]]) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid(`${name} must be a finite number`)
  }
  return { dx: dx / frame.scaleX, dy: dy / frame.scaleY }
}

/**
 * The `Page.captureScreenshot` clip for the whole frame, or for a zoom region `[left, top, right, bottom]` in
 * frame pixels returned at viewport resolution. Later coordinates stay in full-frame space (R12).
 */
export function screenshotClip(frame, region = undefined) {
  if (region === undefined) {
    return { x: 0, y: 0, width: frame.viewport.width, height: frame.viewport.height, scale: frame.scale }
  }
  if (!Array.isArray(region) || region.length !== 4 || !region.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    throw invalid('a zoom region is [left, top, right, bottom] in screenshot pixels')
  }
  const [left, top, right, bottom] = region
  if (left < 0 || top < 0 || right > frame.width || bottom > frame.height || right <= left || bottom <= top) {
    throw invalid(`the zoom region [${region.join(', ')}] is empty or outside the ${frame.width}x${frame.height} screenshot`)
  }
  return {
    x: left / frame.scaleX,
    y: top / frame.scaleY,
    width: (right - left) / frame.scaleX,
    height: (bottom - top) / frame.scaleY,
    scale: 1,
  }
}

/** Width and height from a PNG's IHDR chunk, so the frame is built from the image Chrome returned. */
export function pngSize(buffer) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (!Buffer.isBuffer(buffer) || buffer.length < 24 || !signature.every((byte, i) => buffer[i] === byte)) {
    throw invalid('the image is not a PNG')
  }
  if (buffer.toString('latin1', 12, 16) !== 'IHDR') throw invalid('the PNG has no IHDR chunk first')
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}
