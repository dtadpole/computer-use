/**
 * A fake CDP connection for the session, executor and environment suites: it records every call, answers from a
 * handler table, and lets a test emit protocol events. No browser is involved.
 */

/** A PNG header (signature and IHDR) of the given size, which is all the environment reads from an image. */
export function pngHeader(width, height) {
  const header = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0)
  header.writeUInt32BE(13, 8)
  header.write('IHDR', 12, 'latin1')
  header.writeUInt32BE(width, 16)
  header.writeUInt32BE(height, 20)
  return header
}

export class FakeConnection {
  constructor(handlers = {}) {
    this.calls = []
    this.listeners = new Map()
    this.closed = false
    this.handlers = {
      // The browser-level call announces the first page; a page's own call (its cross-site iframes) announces nothing.
      'Target.setAutoAttach': (params, sessionId) => {
        if (sessionId !== undefined) return { result: {} }
        setImmediate(() => this.emit('Target.attachedToTarget', {
          sessionId: 'S1', targetInfo: { type: 'page', targetId: 'T1', url: 'about:blank', title: '' }, waitingForDebugger: false,
        }))
        return { result: {} }
      },
      'Page.getFrameTree': (params, sessionId) => ({ result: { frameTree: { frame: { id: `F-${sessionId}`, loaderId: `L-${sessionId}` } } } }),
      'Page.createIsolatedWorld': () => ({ result: { executionContextId: 7 } }),
      'Runtime.evaluate': () => ({ result: { result: { value: true } } }),
      'Page.getLayoutMetrics': () => ({ result: { cssVisualViewport: { pageX: 0, pageY: 0 } } }),
      'Page.captureScreenshot': (params) => ({
        result: { data: pngHeader(Math.floor(params.clip.width * params.clip.scale), Math.floor(params.clip.height * params.clip.scale)).toString('base64') },
      }),
      'Browser.getBrowserCommandLine': () => ({ result: { arguments: ['--headless=new', '--use-mock-keychain'] } }),
      ...handlers,
    }
  }

  send(method, params = {}, { sessionId } = {}) {
    if (this.closed) return Promise.reject(new Error('the devtools websocket closed'))
    this.calls.push({ method, params, sessionId })
    const handler = this.handlers[method]
    try {
      return Promise.resolve(handler === undefined ? { result: {} } : handler(params, sessionId, this))
    } catch (error) {
      return Promise.reject(error)
    }
  }

  on(method, handler) {
    const list = this.listeners.get(method) ?? []
    list.push(handler)
    this.listeners.set(method, list)
    return () => list.splice(list.indexOf(handler), 1)
  }

  emit(method, params, sessionId) {
    for (const handler of [...(this.listeners.get(method) ?? [])]) handler(params, { method, params, sessionId })
  }

  /** Calls of one method, optionally on one session. */
  of(method, sessionId) {
    return this.calls.filter((call) => call.method === method && (sessionId === undefined || call.sessionId === sessionId))
  }

  close() {
    this.closed = true
  }
}
