/**
 * The harness side of the fixture's control plane: list tasks, read judged state, reset, and wait for
 * the pages' last reports to land before judging.
 *
 * A page posts its state on every change, so the last report of a run can still be in flight when the
 * agent stops. `settle` waits until a task's report count has been unchanged for `quietMs` before
 * returning its state, so a run is not judged on a state the page has already moved past.
 */

/** A client for one fixture server (`{ url, token }`, as `startFixtureServer` or the CLI returns). */
export function fixtureClient({ url, token }) {
  if (!url || !token) throw new Error('fixtureClient needs the fixture url and token')
  const headers = { authorization: `Bearer ${token}` }

  async function call(method, path, body) {
    const response = await fetch(new URL(path, url), {
      method,
      headers: body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    const value = text ? JSON.parse(text) : null
    if (!response.ok) throw new Error(`fixture ${method} ${path} answered ${response.status}: ${value?.error ?? text}`)
    return value
  }

  const client = {
    /** `{ seed, tasks: [{ id, kind, title, prompt, url, allowedActions, consent, secretNames, source }] }`, optionally of one kind. */
    tasks: (kind) => call('GET', kind ? `/__fixture/tasks?kind=${encodeURIComponent(kind)}` : '/__fixture/tasks'),
    /** `{ seed, tasks: { <id>: { kind, outcome, reason, facts, expected, answer, ... } } }`. */
    state: () => call('GET', '/__fixture/state'),
    /** One task's judged state. */
    taskState: (id) => call('GET', `/__fixture/state/${encodeURIComponent(id)}`),
    /** One task's latest target boxes (`{ viewport, targets: { name: { x, y, width, height, cx, cy } } }`), for oracle plans only. */
    targets: (id) => call('GET', `/__fixture/targets/${encodeURIComponent(id)}`),
    /** The secret values a task's harness passes by reference; never shown to a model. */
    secrets: async (id) => (await call('GET', `/__fixture/secrets/${encodeURIComponent(id)}`)).secrets,
    /** Application requests logged after sequence number `since`, with their Host. */
    requests: async (since = 0) => (await call('GET', `/__fixture/requests?since=${Number(since) || 0}`)).requests,
    /** Clear every task's state; a seed redraws the per-instance values. */
    reset: (seed) => call('POST', '/__fixture/reset', seed === undefined ? {} : { seed }),
    /**
     * One task's state once its page has stopped reporting for `quietMs`, or after `timeoutMs` at the
     * latest (the state is then returned with `settled: false`).
     */
    async settle(id, { quietMs = 300, timeoutMs = 3000, intervalMs = 50 } = {}) {
      const deadline = Date.now() + timeoutMs
      let state = await client.taskState(id)
      let count = state.reports + state.staleReports
      let quietSince = Date.now()
      while (Date.now() < deadline) {
        if (Date.now() - quietSince >= quietMs) return { ...state, settled: true }
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
        state = await client.taskState(id)
        const next = state.reports + state.staleReports
        if (next !== count) {
          count = next
          quietSince = Date.now()
        }
      }
      return { ...state, settled: false }
    },
  }
  return client
}
