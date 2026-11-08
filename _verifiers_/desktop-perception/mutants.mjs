/** Deliberately broken desktop drivers this verifier must fail on, applied to a /tmp copy by prove-failing.mjs. */

const COORDS = '_environments_/macos-desktop/coords.mjs'

export const MUTANTS = Object.freeze([
  { name: 'no-unscale', why: 'screenshot pixels are sent as points, so a downscaled or Retina click lands off target', mutations: [{ file: COORDS, find: '    x: Math.round(frame.originPt.x + point.x / frame.scaleX),', replace: '    x: Math.round(frame.originPt.x + point.x),' }] },
  { name: 'no-origin', why: 'the display origin is dropped, so clicks on a secondary display land on the main one', mutations: [{ file: COORDS, find: '    y: Math.round(frame.originPt.y + point.y / frame.scaleY),', replace: '    y: Math.round(point.y / frame.scaleY),' }] },
  { name: 'off-by-two', why: 'the mapping adds two points on y', mutations: [{ file: COORDS, find: '    y: Math.round(frame.originPt.y + point.y / frame.scaleY),', replace: '    y: Math.round(frame.originPt.y + point.y / frame.scaleY + 2),' }] },
  { name: 'no-bounds', why: 'an out-of-frame click is mapped and sent instead of refused', mutations: [{ file: COORDS, find: '  if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) {', replace: '  if (false) {' }] },
  { name: 'zoom-unscaled', why: 'a zoom region is captured in screenshot pixels, not points', mutations: [{ file: COORDS, find: '  const x1 = Math.ceil(frame.originPt.x + right / frame.scaleX - 1e-9)', replace: '  const x1 = Math.ceil(frame.originPt.x + right - 1e-9)' }] },
])
