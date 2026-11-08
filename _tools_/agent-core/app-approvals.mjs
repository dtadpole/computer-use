import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { createExclusions } from './exclusions.mjs'
import { cuHome } from './trajectory.mjs'

/**
 * The `always` app approvals of desktop runs (design: desktop-extension/app-policy.md, C3): one file,
 * `$CU_HOME/app-approvals.json` (mode 600), written only after a human answer through the consent gate. It is read
 * at every check, so a revoke reaches running runs at their next action. A corrupt file fails closed: it covers
 * nothing and is never silently overwritten. An excluded app can never be granted.
 */

const SCHEMA = 'cu-app-approvals/v1'

export class ApprovalStoreError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ApprovalStoreError'
    this.code = code
  }
}

export function createAppApprovals({ path = join(cuHome(), 'app-approvals.json'), exclusions = createExclusions(), now = () => new Date() } = {}) {
  /** `{ apps, corrupt }`; a missing file is an empty store, an unreadable one is corrupt. */
  function load() {
    if (!existsSync(path)) return { apps: [], corrupt: false }
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'))
      if (data?.schema !== SCHEMA || !Array.isArray(data.apps)) return { apps: [], corrupt: true }
      return { apps: data.apps.filter((entry) => typeof entry?.bundleId === 'string'), corrupt: false }
    } catch {
      return { apps: [], corrupt: true }
    }
  }

  function save(apps) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    const tmp = `${path}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify({ schema: SCHEMA, apps }, null, 2) + '\n', { mode: 0o600 })
    chmodSync(tmp, 0o600)
    renameSync(tmp, path)
  }

  const same = (a, b) => a.toLowerCase() === b.toLowerCase()

  return {
    path,
    /** True only when an intact store holds the app and the app is not excluded. */
    covers(bundleId) {
      if (typeof bundleId !== 'string' || exclusions.isExcludedApp(bundleId).excluded) return false
      const { apps, corrupt } = load()
      return !corrupt && apps.some((entry) => same(entry.bundleId, bundleId))
    },
    list() {
      return load()
    },
    /** Record an `always` approval; `by` names the human channel that answered (live, tty, api). */
    grantAlways(bundleId, { by }) {
      const verdict = exclusions.isExcludedApp(bundleId)
      if (verdict.excluded) throw new ApprovalStoreError('excluded_app', `${bundleId} is excluded (${verdict.kind}) and can never be approved`)
      if (!['live', 'tty', 'api'].includes(by)) throw new ApprovalStoreError('not_human_channel', `an always approval needs a human channel, not '${by}'`)
      const { apps, corrupt } = load()
      if (corrupt) throw new ApprovalStoreError('store_corrupt', `${path} is unreadable; fix or remove it before granting`)
      if (!apps.some((entry) => same(entry.bundleId, bundleId))) save([...apps, { bundleId, grantedAt: now().toISOString(), by }])
    },
    /** Remove an approval; returns whether one was removed. */
    revoke(bundleId) {
      const { apps, corrupt } = load()
      if (corrupt) throw new ApprovalStoreError('store_corrupt', `${path} is unreadable; fix or remove it`)
      const kept = apps.filter((entry) => !same(entry.bundleId, bundleId))
      if (kept.length === apps.length) return false
      save(kept)
      return true
    },
  }
}
