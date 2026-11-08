/** Deliberately broken desktop drivers this verifier must fail on, applied to a /tmp copy by prove-failing.mjs. */

const PLAN = '_environments_/macos-desktop/input-plan.mjs'
const KEYS = '_environments_/macos-desktop/keys.mjs'

export const MUTANTS = Object.freeze([
  { name: 'click-no-up', why: 'a click presses and never releases (R86 stuck input)', mutations: [{ file: PLAN, find: "      steps.push({ kind: 'up', button, x: at.x, y: at.y, clickCount: count, flags })", replace: '' }] },
  { name: 'double-click-count-1', why: 'every press says clickCount 1, so macOS sees two single clicks', mutations: [{ file: PLAN, find: "      steps.push({ kind: 'down', button, x: at.x, y: at.y, clickCount: count, flags })", replace: "      steps.push({ kind: 'down', button, x: at.x, y: at.y, clickCount: 1, flags })" }] },
  { name: 'navigate-accepted', why: 'navigate is quietly turned into a screenshot instead of refused by name', mutations: [{ file: PLAN, find: "    case 'navigate': throw new EnvironmentError('unsupported_action', NAVIGATE_REFUSAL)", replace: "    case 'navigate': return plan('screenshot', null, { local: { kind: 'screenshot' } })" }] },
  { name: 'chord-no-command', why: 'the key of a chord goes down without its modifier flags', mutations: [{ file: PLAN, find: '    const own = (stroke) => flags | (stroke.shift ? MODIFIER_FLAGS.SHIFT : 0)', replace: '    const own = (stroke) => (stroke.shift ? MODIFIER_FLAGS.SHIFT : 0)' }] },
  { name: 'scroll-sign', why: 'the wheel delta keeps the canonical sign, so the page scrolls the wrong way', mutations: [{ file: PLAN, find: "deltaY: dy === 0 ? 0 : -dy,", replace: 'deltaY: dy,' }] },
  { name: 'type-trims', why: 'typed text loses spaces at chunk edges', mutations: [{ file: PLAN, find: "    if (pending.length > 0) events.push({ kind: 'text', text: pending })", replace: "    if (pending.length > 0) events.push({ kind: 'text', text: pending.trim() })" }] },
  { name: 'clipboard-chord-refused', why: 'the driver refuses copy, cut and paste chords again, against D-031', mutations: [{ file: PLAN, find: '  const strokes = main.map((key) => keyStroke(key))', replace: "  if (modifiers.length > 0 && main.some((key) => ['C', 'X', 'V'].includes(String(key).toUpperCase()))) throw invalid('mutant: copy, cut and paste refused')\n  const strokes = main.map((key) => keyStroke(key))" }] },
])
