/**
 * The library face of agent-core: everything another component may import. Environments, the live view and the
 * MCP server import from here; agent-core imports none of them (design: layout-and-ownership.md).
 */

export { CANONICAL_KEYS, MODIFIER_KEYS, KeyError, isCanonicalKey, normalizeKey, parseKeyCombo } from './keys.mjs'
export {
  FIXED_DENY_LOOPBACK_PORTS,
  SitePolicyConfigError,
  canonicalHost,
  createSitePolicy,
  isFixedDenied,
  originPattern,
  parsePattern,
  parseSiteUrl,
} from './sites.mjs'
export {
  MIN_FREE_PERCENT,
  REGISTRY_DIR,
  ResourceRefusedError,
  TEAM_BROWSER_CAP,
  memoryFloor,
  parseMemoryPressure,
  pidAlive,
  readFreeMemoryPercent,
  resourceGate,
} from './resource-gate.mjs'
export { LIFETIMES, SOURCES, STATES, createRunControl } from './control.mjs'
export {
  BUTTONS,
  EXTENSION_ACTIONS,
  GA_ACTIONS,
  MAX_ACTIONS_PER_CALL,
  RESULT_STATUSES,
  WAIT_DEFAULT_MS,
  WAIT_MAX_MS,
  validateBatch,
} from './actions.mjs'
export { CLASSES, NEVER_PRE_APPROVED, REFUSED_TASK_CLASSES, createApprovalStore, createPolicy, looksSensitive, screenTask } from './policy.mjs'
// The desktop policy pieces: the hard exclusions, the per-app policy and the `always` app approvals store.
export { EXCLUDED_APPS, createExclusions } from './exclusions.mjs'
export { createAppPolicy } from './app-policy.mjs'
export { createAppApprovals } from './app-approvals.mjs'
export { apiController, ttyController, unattendedController } from './consent.mjs'
export { inspectPageText } from './inspect.mjs'
export { SCHEMA, buildInfo, createRecorder, cuHome, formatReplay, newRunId, pruneRuns, readRun, redactAction, runsDir } from './trajectory.mjs'
export { ScriptError, createScriptedAdapter, loadPlan, toTurn } from './adapter-scripted.mjs'
export { FakeEnvironmentError, createFakeEnvironment } from './fake-env.mjs'
export { DEFAULT_BOUNDS, DEFAULT_INSTRUCTIONS, RUN_STATUSES, runTask } from './loop.mjs'
export {
  AdapterError,
  CLAUDE_IMAGE_LIMITS,
  CLAUDE_PRICES,
  TOOLSET_MODELS,
  buildResultContent,
  costOf,
  createClaudeGatewayAdapter,
  memberToAction,
  parseTurn as parseClaudeTurn,
} from './adapter-claude.mjs'
export { buildResponsesInput, createResponsesAdapter, parseResponsesTurn } from './adapter-responses.mjs'
export { ENVIRONMENTS, LIVE_VIEW, startRun } from './run.mjs'
