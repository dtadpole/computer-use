import { createExclusions } from '../agent-core/exclusions.mjs'
import { isAlias, localConfig } from '../agent-core/local-config.mjs'

/**
 * The four tools of the integration surface (design: integration-surface.md) and their input checks. The tool
 * interface carries no consent path: `approved` and `lifetime` are refused by name, and `take_over`, `hand_back` and
 * `consent` need the control token, which this server never hands out (D-013, consent-authority.md).
 *
 * A run works in agent core's `chrome-browser` (the default) or `macos-desktop` (M9). A desktop run names the apps it
 * may ask for (`apps`, bundle ids); they are candidates, never approvals: each app joins the run only after a person
 * approves it in the live view or has always-approved it (app-policy.md P11, D-029 d). So nothing a caller sends here
 * approves an app: an input shaped like an approval is refused by name, `pre_approve` refuses `new_app`, and an app agent
 * core's exclusions name is refused before any run starts, since no approval could ever admit it.
 */

export const MAX_WAIT_SECONDS = 50
export const CALLER_COMMANDS = Object.freeze(['pause', 'resume', 'stop', 'guide'])
export const CONTROL_TOKEN_COMMANDS = Object.freeze(['take_over', 'hand_back', 'consent'])
export const BROWSER = 'chrome-browser'
export const DESKTOP = 'macos-desktop'
/** Agent core's environment names (run.mjs `ENVIRONMENTS`, `cli.mjs run --env`); a test keeps the two in step. */
export const ENVIRONMENTS = Object.freeze([BROWSER, DESKTOP])
/** The desktop driver's limits on start apps: at most 32, each a bundle id as the helper accepts it. */
export const MAX_APPS = 32
const BUNDLE_ID = /^[A-Za-z0-9][A-Za-z0-9.-]{0,254}$/
// An unknown input that reads like an approval gets the reason, not just "unknown input": the caller should learn
// that approving is not something this tool can be asked for, whatever the field is called.
const APPROVAL_INPUT = /approv|consent|lifetime|always|grant/i
// Classes a caller may never pre-approve here: an app is approved by a person (P11); on the desktop launch_code and
// credential always ask (P10, P4), and agent core would drop them silently, so the caller hears it instead.
const NEVER_PRE_APPROVED_HERE = Object.freeze({ [BROWSER]: ['new_app'], [DESKTOP]: ['new_app', 'launch_code', 'credential'] })
/** The run model when neither the caller nor the local config's `defaultModel` names one. */
export const FALLBACK_MODEL = 'claude-gateway/claude-opus-5'
const GATEWAY_PREFIX = 'claude-gateway/'
const PUBLIC_MODEL = /^claude-gateway\/claude-[a-z0-9.-]+$/

export class ToolInputError extends Error {
  constructor(message) {
    super(message)
    this.name = 'ToolInputError'
  }
}

const RUN_ID = { type: 'string', description: 'The run_id computer_use_start returned.' }

export const TOOLS = Object.freeze([
  {
    name: 'computer_use_start',
    description: "Start a computer-use run: an agent does the task either in a fresh headless Chrome (environment 'chrome-browser', the default), starting at start_url and staying on allowed sites, or in apps already running on this Mac (environment 'macos-desktop'), only the apps listed in apps and each only once a person approves it. Returns run_id, a watch-only live view URL and the state. Poll computer_use_status until it is finished. App approvals, purchases, sends and other consequential steps wait for a person in the live view; they are never approved through these tools.",
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'What the agent should do, in plain words.' },
        environment: { type: 'string', enum: [...ENVIRONMENTS], description: "Where the agent works: 'chrome-browser' (default), a fresh headless Chrome opened at start_url; or 'macos-desktop', apps already running on this Mac's display, named in apps (the run launches none)." },
        start_url: { type: 'string', description: "chrome-browser only, and required there: the http(s) page the browser opens first; its origin is allowed." },
        allow_sites: { type: 'array', items: { type: 'string' }, description: 'chrome-browser only: further origins or patterns the browser may visit, such as https://*.example.com.' },
        apps: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: MAX_APPS, description: "macos-desktop only, and required there: bundle ids of already-running apps the run may ask to use, such as com.apple.TextEdit. They are candidates, not approvals: the run uses an app only once a person approves it in the live view (or has always-approved it); this tool cannot approve one. Terminals, password and clipboard managers, AI agents and system security apps are excluded and refused." },
        exclude_apps: { type: 'array', items: { type: 'string' }, description: "macos-desktop only: more bundle ids (or 'prefix.*') the run must never use; exclusions can only be added." },
        model: { type: 'string', description: "The agent model: 'claude-gateway/<model>', such as 'claude-gateway/claude-sonnet-5-5' or a model alias this machine's local config defines, or 'scripted' with plan for checks. Default: the local config's defaultModel, else 'claude-gateway/claude-opus-5'." },
        plan: { type: 'string', description: 'Absolute path of a scripted plan file (model scripted only).' },
        max_steps: { type: 'integer', minimum: 1, maximum: 100, description: 'Most model requests in the run (default 30).' },
        max_minutes: { type: 'number', minimum: 0.5, maximum: 60, description: 'Most active minutes (default 15).' },
        max_cost_usd: { type: 'number', minimum: 0, maximum: 20, description: 'Most estimated model cost in USD (default 2).' },
        pre_approve: { type: 'array', items: { type: 'string' }, description: "Approvals a person already gave for this run, as 'class@origin'; some classes are never pre-approved, and an app (new_app) never is." },
        secrets: { type: 'array', items: { type: 'string' }, description: "Secret references 'name=env:VAR' or 'name=file:/path'; the agent types them as {{secret:name}} and never sees the value." },
        live_view: { type: 'boolean', description: "Serve the live view (default true). Without it, consent requests decline, and so does a desktop run's request to use each app." },
      },
      required: ['task'],
      additionalProperties: false,
    },
  },
  {
    name: 'computer_use_status',
    description: 'The state of a run: running, paused, taken_over, awaiting_consent or finished; step count; the last step; a question from the agent; which step waits for a person. Waits up to wait_seconds (at most 50) and returns early on any change. When finished: the result, the final screenshot as an image and the trajectory link.',
    inputSchema: {
      type: 'object',
      properties: { run_id: RUN_ID, wait_seconds: { type: 'number', minimum: 0, maximum: MAX_WAIT_SECONDS, description: 'Seconds to wait for a change (0 to 50, default 0).' } },
      required: ['run_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'computer_use_respond',
    description: 'Answer a question the agent asked (status shows question_id and text). Only questions: consent is never answered here.',
    inputSchema: {
      type: 'object',
      properties: { run_id: RUN_ID, question_id: { type: 'string' }, answer: { type: 'string' } },
      required: ['run_id', 'question_id', 'answer'],
    },
  },
  {
    name: 'computer_use_control',
    description: 'Pause the run, resume a pause made with this tool, stop it, or queue guidance (command guide with text) for the next step.',
    inputSchema: {
      type: 'object',
      properties: { run_id: RUN_ID, command: { type: 'string', enum: [...CALLER_COMMANDS] }, text: { type: 'string', description: 'Guidance text (guide) or the reason (stop).' } },
      required: ['run_id', 'command'],
    },
  },
])

const START_INPUTS = TOOLS[0].inputSchema.properties
const isString = (value) => typeof value === 'string' && value.trim() !== ''

function stringList(value, name) {
  if (value === undefined) return []
  if (!Array.isArray(value) || !value.every(isString)) throw new ToolInputError(`${name} must be a list of strings`)
  return value
}

function bounded(value, name, min, max, integer = false) {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new ToolInputError(`${name} must be ${integer ? 'an integer' : 'a number'} from ${min} to ${max}`)
  }
  return value
}

/** The browser's target: a start URL and allowed sites; the desktop's fields are refused by name. */
function browserTarget(input) {
  for (const name of ['apps', 'exclude_apps']) {
    if (input[name] !== undefined) throw new ToolInputError(`${name} is for environment macos-desktop; a chrome-browser run names its sites in start_url and allow_sites`)
  }
  if (!isString(input.start_url)) throw new ToolInputError('start_url is required for a chrome-browser run (the default environment); a macos-desktop run names apps instead')
  let url
  try {
    url = new URL(input.start_url)
  } catch {
    throw new ToolInputError('start_url must be an absolute http(s) URL')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ToolInputError('start_url must be an absolute http(s) URL')
  return { startUrl: url.href, allowSites: stringList(input.allow_sites, 'allow_sites'), apps: [], excludeApps: [] }
}

/**
 * The desktop's target: the start apps, checked as the driver checks them (1 to 32 bundle ids) and against agent
 * core's exclusions plus `exclude_apps`, so an app that can never be admitted is refused here, by name and kind,
 * rather than asked about and skipped inside the run. The browser's fields are refused by name.
 */
function desktopTarget(input) {
  for (const name of ['start_url', 'allow_sites']) {
    if (input[name] !== undefined) throw new ToolInputError(`${name} is for environment chrome-browser; a macos-desktop run attaches to running apps named in apps`)
  }
  if (input.apps === undefined || (Array.isArray(input.apps) && input.apps.length === 0)) {
    throw new ToolInputError('apps is required for a macos-desktop run: the bundle ids of already-running apps it may ask to use, such as com.apple.TextEdit')
  }
  if (!Array.isArray(input.apps) || input.apps.length > MAX_APPS) throw new ToolInputError(`apps must list 1 to ${MAX_APPS} bundle ids`)
  for (const app of input.apps) {
    if (typeof app !== 'string' || !BUNDLE_ID.test(app)) throw new ToolInputError(`apps: '${String(app)}' is not a bundle id (such as com.apple.TextEdit)`)
  }
  const excludeApps = stringList(input.exclude_apps, 'exclude_apps')
  let exclusions
  try {
    exclusions = createExclusions({ extra: excludeApps })
  } catch (error) {
    throw new ToolInputError(`exclude_apps: ${error.message}`)
  }
  for (const app of input.apps) {
    const verdict = exclusions.isExcludedApp(app)
    if (verdict.excluded) {
      throw new ToolInputError(verdict.kind === 'config'
        ? `apps: ${app} is also in exclude_apps`
        : `apps: ${app} is excluded (${verdict.kind}) and can never be used in a run, whoever approves it`)
    }
  }
  return { startUrl: null, allowSites: [], apps: [...input.apps], excludeApps: [...excludeApps] }
}

/**
 * Pre-approvals by class: the ones a caller may never give in this environment are refused by name. On the desktop
 * only `unknown_target` can be limited to one app (`unknown_target@<bundle id>`, app-policy.md); agent core reads any
 * other `class@<bundle id>` as covering every app, so that form is refused rather than silently widened.
 */
function checkPreApprove(list, environment) {
  for (const text of list) {
    const [cls, where] = text.split('@').map((part) => part.trim())
    if (NEVER_PRE_APPROVED_HERE[environment].includes(cls)) {
      throw new ToolInputError(cls === 'new_app'
        ? "pre_approve 'new_app' is refused: an app is approved only by a person, in the live view or as an always approval they gave; list it in apps and the run asks"
        : `pre_approve '${cls}' is refused: on the desktop it is never pre-approved; the run asks a person each time`)
    }
    if (environment === DESKTOP && where !== undefined && cls !== 'unknown_target') {
      throw new ToolInputError(`pre_approve '${text}' is refused: on the desktop only unknown_target can be limited to one app; give '${cls}' alone (every approved app) or leave it out`)
    }
    if (environment === DESKTOP && cls === 'unknown_target' && where !== undefined && !BUNDLE_ID.test(where)) {
      throw new ToolInputError(`pre_approve '${text}' is refused: after @ comes the bundle id of the app it covers`)
    }
  }
  return list
}

/**
 * Check `computer_use_start` input; returns a normalised copy. The default model and the model aliases come from the
 * machine's local config (agent-core/local-config.mjs), read only when needed; `config` injects it.
 */
export function checkStart(input = {}, { config } = {}) {
  for (const key of Object.keys(input)) {
    if (key in START_INPUTS) continue
    if (APPROVAL_INPUT.test(key)) {
      throw new ToolInputError(`'${key}' is refused: apps and consequential steps are approved only by a person, in the live view or their own terminal; this tool never approves anything`)
    }
    throw new ToolInputError(`unknown input '${key}'`)
  }
  if (!isString(input.task)) throw new ToolInputError('task is required')
  const environment = input.environment ?? BROWSER
  if (!ENVIRONMENTS.includes(environment)) throw new ToolInputError(`unknown environment '${String(environment)}': one of ${ENVIRONMENTS.join(', ')}`)
  const target = environment === DESKTOP ? desktopTarget(input) : browserTarget(input)
  let cfg = config
  const local = () => (cfg ??= localConfig())
  const model = input.model ?? local().defaultModel ?? FALLBACK_MODEL
  const known = PUBLIC_MODEL.test(model) || (typeof model === 'string' && model.startsWith(GATEWAY_PREFIX) && isAlias(model.slice(GATEWAY_PREFIX.length), local()))
  if (model !== 'scripted' && !known) throw new ToolInputError(`unknown model '${model}'`)
  if (model === 'scripted' && !(isString(input.plan) && input.plan.startsWith('/'))) throw new ToolInputError('model scripted needs plan, an absolute path')
  if (input.live_view !== undefined && typeof input.live_view !== 'boolean') throw new ToolInputError('live_view must be true or false')
  return {
    task: input.task.trim(),
    environment,
    ...target,
    model,
    plan: input.plan ?? null,
    maxSteps: bounded(input.max_steps, 'max_steps', 1, 100, true),
    maxMinutes: bounded(input.max_minutes, 'max_minutes', 0.5, 60),
    maxCostUsd: bounded(input.max_cost_usd, 'max_cost_usd', 0, 20),
    preApprove: checkPreApprove(stringList(input.pre_approve, 'pre_approve'), environment),
    secrets: stringList(input.secrets, 'secrets'),
    liveView: input.live_view ?? true,
  }
}

export function checkStatus(input = {}) {
  if (!isString(input.run_id)) throw new ToolInputError('run_id is required')
  return { runId: input.run_id, waitSeconds: bounded(input.wait_seconds, 'wait_seconds', 0, MAX_WAIT_SECONDS) ?? 0 }
}

export function checkRespond(input = {}) {
  for (const name of ['approved', 'lifetime']) {
    if (input[name] !== undefined) throw new ToolInputError(`'${name}' is refused: consent is never answered through this tool; the user answers it in the live view themselves`)
  }
  if (!isString(input.run_id) || !isString(input.question_id) || typeof input.answer !== 'string' || input.answer.trim() === '') {
    throw new ToolInputError('run_id, question_id and a non-empty answer are required')
  }
  return { runId: input.run_id, questionId: input.question_id, answer: input.answer }
}

export function checkControl(input = {}) {
  if (!isString(input.run_id)) throw new ToolInputError('run_id is required')
  if (CONTROL_TOKEN_COMMANDS.includes(input.command)) {
    throw new ToolInputError(`'${input.command}' needs the run's control token, which this tool never holds; ask the user to do it in the live view themselves`)
  }
  if (!CALLER_COMMANDS.includes(input.command)) throw new ToolInputError(`command must be one of ${CALLER_COMMANDS.join(', ')}`)
  if (input.command === 'guide' && !isString(input.text)) throw new ToolInputError('guide needs text')
  return { runId: input.run_id, command: input.command, text: typeof input.text === 'string' ? input.text : undefined }
}
