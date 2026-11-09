/**
 * A test double of the environment driver interface (design: environment-driver.md), so the core's suites never
 * need Chrome. It keeps an input log, answers targets from a map, and can fail chosen actions.
 */

// A valid 1x1 PNG; the reported width and height are the frame's.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

/** Error shape the real driver throws: `{ code, message }`. */
export class FakeEnvironmentError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'EnvironmentError'
    this.code = code
  }
}

/**
 * Options: `width`, `height`, `url`, `title`, `targets` (a function `(point) => target` or a map from `"x,y"`),
 * `focused` (the focused element), `pageText`, `hiddenText`, `dialog`, `fail(action) => { code, message } | null`,
 * `effect(action) => partial ActionEffect`, `control` (checked with `agentMayAct()`).
 */
export function createFakeEnvironment({
  width = 1440,
  height = 900,
  url = 'http://127.0.0.1:43117/',
  title = 'fixture',
  targets = null,
  focused,
  pageText = '',
  hiddenText = '',
  dialog = null,
  fail = () => null,
  effect = () => ({}),
  control = null,
  kind = 'browser',
  frontmost = 'ai.reflection.cu.fixture',
  secureInput = false,
} = {}) {
  // CU-363: an unread or body focus on a web page now asks for printable input, so a fake page's default focus is a plain
  // search field (what a scripted 'type' aims at); a test about a missing focus passes focused: null.
  if (focused === undefined) focused = kind === 'desktop' ? { origin: frontmost, role: 'AXTextField', name: 'Notes', editable: true, fingerprint: 'fake-notes' } : { tag: 'input', inputType: 'search', role: 'searchbox', name: 'Search', editable: true }
  const log = []
  const listeners = new Map()
  let currentUrl = url
  let currentDialog = dialog
  // Desktop mode (C8): the frontmost app, secure input and AX-like targets of the macos-desktop driver's state().
  let frontApp = frontmost
  let secure = secureInput
  let closed = false
  let screenshots = 0

  const assertOpen = () => {
    if (closed) throw new FakeEnvironmentError('closed', 'the environment is closed')
  }
  // While a dialog is held, target lookups return the dialog itself, as the chrome-browser driver does.
  const dialogTarget = () => ({ tag: 'dialog', role: 'alertdialog', name: currentDialog.message ?? '', dialogType: currentDialog.type, fingerprint: `dialog:${currentDialog.type}` })
  const targetAt = (x, y) => {
    if (typeof targets === 'function') return targets({ x, y })
    if (targets && targets[`${x},${y}`]) return targets[`${x},${y}`]
    if (kind === 'desktop') return null
    return { tag: 'body', role: 'generic', name: '', origin: new URL(currentUrl).origin, box: [0, 0, width, height], fingerprint: 'body' }
  }

  return {
    kind,
    site: kind === 'desktop' ? 'desktop:fake' : 'browser:fake',
    // Desktop-only members, so a browser fake keeps exactly the browser driver's members (parity tests).
    ...(kind === 'desktop' ? { pauseArmed: true, setFrontmost(bundleId) { frontApp = bundleId }, setSecureInput(on) { secure = on } } : {}),
    frame: Object.freeze({ width, height, scale: 1, viewport: Object.freeze({ width, height }), devicePixelRatio: 1 }),
    log,
    get closed() { return closed },
    async screenshot({ region } = {}) {
      assertOpen()
      screenshots += 1
      const [w, h] = region ? [region[2] - region[0], region[3] - region[1]] : [width, height]
      return { data: PNG_1X1, mimeType: 'image/png', width: w, height: h, url: currentUrl, title, takenAt: new Date().toISOString() }
    },
    async perform(action) {
      assertOpen()
      if (control && !control.agentMayAct()) throw new FakeEnvironmentError('taken_over', 'agent input is refused now')
      if (currentDialog && !(action.type === 'keypress' && ['ENTER', 'ESCAPE'].includes(action.keys?.[0])) && action.type !== 'type') {
        throw new FakeEnvironmentError('dialog_open', 'a dialog must be answered first')
      }
      const failure = fail(action)
      if (failure) throw Object.assign(new FakeEnvironmentError(failure.code, failure.message), failure.details ? { details: failure.details } : {})
      log.push(action)
      if (currentDialog && action.type === 'keypress') currentDialog = null
      const extra = effect(action) ?? {}
      if (action.type === 'navigate') currentUrl = action.url
      if (extra.url) currentUrl = extra.url
      if (extra.dialog !== undefined) currentDialog = extra.dialog
      return { navigated: action.type === 'navigate' || Boolean(extra.url), url: currentUrl, blocked: [], popup: null, dialog: currentDialog, ...extra }
    },
    state() {
      if (kind === 'desktop') return { url: `app:${frontApp}`, title, loading: false, tabs: [], dialog: currentDialog, frontmostBundleId: frontApp, secureInput: secure }
      return { url: currentUrl, title, loading: false, tabs: [{ id: 't1', url: currentUrl, title, active: true }], dialog: currentDialog }
    },
    async inspectPoint({ x, y }) {
      assertOpen()
      if (currentDialog) return dialogTarget()
      return targetAt(x, y)
    },
    async focusedElement() {
      assertOpen()
      if (currentDialog) return dialogTarget()
      return focused
    },
    async pageText() {
      assertOpen()
      return { text: pageText, hiddenText }
    },
    async navigate({ url: next }) {
      currentUrl = next
      return { navigated: true, url: next, blocked: [], popup: null, dialog: null }
    },
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(fn)
      return () => listeners.get(event).delete(fn)
    },
    emit(event, payload) {
      for (const fn of listeners.get(event) ?? []) fn(payload)
    },
    get screenshotCount() { return screenshots },
    async close() {
      closed = true
    },
  }
}
