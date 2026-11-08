/** Deliberately broken builds this verifier must fail on, applied to a /tmp copy by prove-failing.mjs. */

const COORDS = '_environments_/chrome-browser/coords.mjs'
const MAPPING = '  return { x: point.x / frame.scaleX, y: point.y / frame.scaleY }'

export const MUTANTS = Object.freeze([
  { name: 'no-unscale', why: 'frame coordinates are used as CSS pixels, so a downscaled click lands short', mutations: [{ file: COORDS, find: MAPPING, replace: '  return { x: point.x, y: point.y }' }] },
  { name: 'off-by-two', why: 'the mapping adds two CSS pixels on x', mutations: [{ file: COORDS, find: MAPPING, replace: '  return { x: point.x / frame.scaleX + 2, y: point.y / frame.scaleY }' }] },
  {
    name: 'screenshot-misscaled',
    why: 'the screenshot is captured at 0.9 of the frame scale, so the model sees targets where they are not',
    mutations: [{ file: COORDS, find: 'height: frame.viewport.height, scale: frame.scale }', replace: 'height: frame.viewport.height, scale: frame.scale * 0.9 }' }],
  },
])
