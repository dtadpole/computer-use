import { execFile } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'

import { createExclusions } from '../../_tools_/agent-core/exclusions.mjs'
import { cuHome } from '../../_tools_/agent-core/lib.mjs'
import { looksSensitive } from '../../_tools_/agent-core/policy.mjs'
import { captureMatchesFrame, checkPoint, displayFrame, fitFactor, pngSize, rectToFrame, regionToGlobal, sizeAt, toFrame, toGlobal } from './coords.mjs'
import { EnvironmentError, invalid, notGranted } from './errors.mjs'
import {
  captureImage, createHelperServer, HELLO_GRANTS, isPrivateDir, LOCAL_INPUT_KINDS, LOCAL_INPUT_VIA, MAX_SIMULATE_SCALE, PEER_CHECKS, readStoppedMarker, replyError, REQUEST_TIMEOUT_MS,
  SETTLE_CAP_MS, SETTLE_MS,
} from './helper-link.mjs'
import { ACTION_TYPES, chordKeyDowns, hitTestPoints, NAVIGATE_REFUSAL, planAction, planBatch } from './input-plan.mjs'
import { keyName, normalizeKey } from './keys.mjs'
import { defaultBundlePath, driverIdentity, driverLaunchProblems, helperExecutablePath, launchHelper } from './launch.mjs'
import { acquireDesktopRun, RUN_ID_PATTERN, SEAT_PATTERN } from './run-lock.mjs'

/**
 * `launchDesktopEnvironment(options)`: the macOS desktop environment driver (design: desktop-extension 0.3.4), with
 * the members of system-architecture/environment-driver.md and agent core's fake environment, built on the helper
 * link. The driver plans and maps; the helper alone touches the screen, input and accessibility, and alone holds the
 * grants.
 *
 * **The scope starts empty (app-policy.md 0.3.4, P11).** The caller's `apps` are candidates only: the launch puts none
 * of them in the helper's scope and captures nothing, because no person has approved any app yet. Agent core asks
 * `new_app` for each candidate the always store does not cover and calls `addApp(bundleId)` for each approved one
 * before its first capture. Until then `screenshot`, `perform`, `planBatch`, `inspectPoint`, `focusedElement`,
 * `pageText` and `startScreencast` refuse `out_of_scope` with `details.reason: 'no_scope'` - the helper's own code for
 * the same state - and send nothing. A caller that approved its apps some other way (a check on the fake helper) calls
 * `addApp` for each too: there is one way into the scope. The helper protocol has no empty `scope` request (it takes
 * 1 to 32 ids), so the empty scope is no `scope` request at all.
 *
 * **The frame is known at launch, without a capture.** Agent core writes `frame` into run.json's header before any
 * start app is admitted, so the launch computes it from the hello alone: the main display the helper reports (else
 * its first), at that display's backing scale (or `simulateScale`), fitted to the adapter's limits by the same
 * `fitFactor` and floored size a capture is asked for (`displayFrame`). The first app that joins confirms it: the
 * display the helper names for the scope must be that one and the first capture must have that frame's geometry and
 * size, or `addApp` refuses `display_changed` and the scope stays empty (capture-and-scaling.md: one display per run,
 * the frame fixed for the run, never a silent remap). `frame` never changes after launch.
 *
 * Options:
 * - `apps`: candidate bundle ids, 0 to 32 (default none); checked for shape only and never sent at launch - agent
 *   core decides which to ask about (an excluded candidate is skipped there, and refused here by `addApp`);
 * - `seat` (required, a [cu] seat key) and `runId` (default `control.runId`, else a fresh id): who holds the
 *   desktop-run lock, named to the next seat that is refused;
 * - `frame`: the adapter's image limits (`maxWidth`, `maxHeight`, `maxLongEdge`, `maxPixels`, `maxTiles` + `tileSize`),
 *   checked with the other options: the launch fits the frame to them;
 * - `control` (agent core's `createRunControl`) and `signal` (defaults to `control.signal`);
 * - `mode`: `global` (default, design: works for every app) or `pid` (only where measured, Q-D3);
 * - `cuHome`, `runDir` (default `$CU_HOME/run`), `bundlePath` (default `$CU_HOME/helper/CUHelper.app`);
 * - `connectTimeoutMs`, `helloTimeoutMs`, `requestTimeoutMs`;
 * - `simulateScale`: the design's capture seam - every capture asks the helper to render at this backing scale (2), so
 *   the frame maps per axis at a factor above 1 on a scale-1 display; for live checks only;
 * - `simulateDisplay` `{width, height}`: points of the main display, from its top-left, that the run takes as its whole
 *   display (CU-70): the frame is that region, every full capture asks for it, and a point outside it is refused like
 *   any point off the frame - with simulateScale 2 a 1512x982 region is a 14-inch Retina laptop; for live checks only;
 * - `refitFrameAtFirstApp` (CU-68, default false): the first app's join may re-fit the frame to the display its focused
 *   window is on, if the hello listed it. A caller that sets it must call `lockFrame()` before anything has used the
 *   frame - before a model session opens with its size - and record the frame it reads afterwards (run.json's header);
 *   without it, another display ends the run `display_changed`, as before;
 * - `settleMs`: the hands-off time the first input after a human resume asks the helper to wait for (design 0.4.1,
 *   default `SETTLE_MS`, 1500), a whole number of milliseconds from 1 to the helper's cap `SETTLE_CAP_MS`; a check sets
 *   it short so it need not wait a second and a half (see "The settle after a human resume" below);
 * - `runLockDir`: shorthand for `runLock` with `acquireDesktopRun({ seat, runId, dir: runLockDir })`, so a check can
 *   hold its own lock directory without writing the seam (one or the other, not both);
 * - `exclusions`: agent core's `createExclusions()` object (default: the hard exclusions); `addApp` refuses an excluded
 *   app by name before any request names it;
 * - the socket's peer check (red team B5, see `createHelperServer`): `peerCheck` (`require` by default, `warn`, `off`),
 *   `helperExecutable` (default `<bundlePath>/Contents/MacOS/CUHelper`), `helperRequirement` (default
 *   `identifier "com.reflection.cu-helper"`), and the seams `identifyPeer`, `verifyPeer`, `peerLog`;
 * - the helper's own peer check (D-029 a, see `launch.mjs`): every socket launch names this process to the helper as
 *   `--driver-node` and `--driver-entry` (real paths of `process.execPath` and `process.argv[1]`), so the driver must
 *   run as plain `node <entry>.mjs`, without `NODE_OPTIONS`, `DYLD_*` and the like; `enforceBoundary: true` adds
 *   `--enforce-boundary` (the helper checks its peer even with no grant: cu-verifier's pre-grant boundary check) and
 *   `lockPath`, only with it, `--lock-path <abs path>` (a private one-helper lock for such a check). Both belong to the
 *   socket path; with a `connect` seam there is no launch to give them to, so they are refused there;
 * - `heldMarkerPath` (absolute; socket path only): passed as `--held-marker`, where the helper keeps its held-keys
 *   marker (CU-64 G1). Unset, a live helper uses the owner's `~/.computer-use/helper/held-keys.json`, so a crash in an
 *   ordinary run is released by the next ordinary run; a check under a private CU_HOME names one under it (CU-94);
 * - seams: `runLock` (replaces `acquireDesktopRun`: gets `{ seat, runId }`, resolves to `{ release() }` or rejects),
 *   `spawn` (for `open`), `launch` (replaces `launchHelper`: gets `{ bundlePath, socketPath, tokenPath, driverNode,
 *   driverEntry }`, plus `enforceBoundary` and `lockPath` when set, and must start something that connects to the
 *   socket), `connect` (replaces socket and launch: resolves with an accepted `HelperLink`, as `connectStdio` gives
 *   for the fake helper) with `captureDir`, the private directory that helper writes capture files to (on the socket
 *   path it is the socket's own directory).
 *
 * Launch order: the desktop-run lock (one desktop run team-wide, D-024) before anything is launched, the link (peer
 * and hello checked), the Screen Recording grant from the hello (without it nothing could ever be seen, so the run
 * stops before any person is asked about an app), the frame from the hello's displays (none reported is
 * `resource_refused`, reason `no_display`, for the same reason), then the local-input pause armed (before any global
 * input, D-024). No scope, no capture. Any failure closes the link, removes the run directory and releases the lock
 * before the error is thrown; a missing grant surfaces as `not_granted` naming it, and a helper that refuses this
 * driver as its peer (it closes before any hello, D-029) as `helper_lost` with `details.reason: 'no_hello'` (and
 * `details.driver`, what about this process such a check refuses - variable names and a count, no values). `close()`
 * releases the lock last, after the helper is told `bye`. `addApp(bundleId)` grows the scope after a person approves
 * an app; the first one also confirms the frame with the run's first capture.
 *
 * **Mapping on the effect (C7).** Every pointer action's effect (`click`, `double_click`, `triple_click`, `move`,
 * `drag`, `scroll`) carries `mapping: { frameScaleX, frameScaleY, originPt: { x, y }, display }`, the very numbers its
 * frame points were mapped with (capture-and-scaling.md: global = `originPt + (x / frameScaleX, y / frameScaleY)`,
 * rounded to the nearest point), so the trajectory can replay where a click landed. Actions that map no frame point
 * (`keypress`, `type`, `wait`, `screenshot`, `zoom`, `cursor_position`) carry none.
 *
 * **The target check (D-036).** Before a pointer action's `input`, the driver hit-tests the global points it acts at
 * (the click, move or scroll point; a drag's start and end) and posts nothing when one is over an app outside the
 * scope (`out_of_scope`, `details.reason: 'target_out_of_scope'`, naming the app) or cannot be verified
 * (`target_unverified`). Agent core's policy and the helper's per-event check each judge the same point; live, both
 * let one through, so the driver checks too. Empty space passes.
 *
 * Design 0.3 on the driver side: hello grants include `postEvents` (`grants`, `state().grants`); secure event input
 * refuses key steps as `secure_input`, a hand-off, and `state().secureInput` stays true for agent core's app policy
 * until a person hands the run back - whether the helper says so in the mid-batch form the design gives it
 * (`{ok: true, done: false, failedAt, code: 'secure_input'}`, at index 0 when nothing was posted; helper 0.2.2 uses
 * only this) or as a refusal (`{ok: false, code: 'secure_input'}`, still accepted); targets carry `opaque` and a
 * fingerprint over bundle id, role, title and frame.
 * System prompts (CU-76): a privacy or permission prompt the system shows, even inside an approved app's window
 * (Allow Paste, a TCC prompt), is the person's to answer. The helper marks its elements (`systemPrompt: true`) and
 * says on every capture whether one can take keys - a prompt process in front, or a system dialog as the front approved
 * app's focused window or its sheet (helper 0.2.28; a prompt merely overlapping a window does not count); the driver
 * passes both on (`target.systemPrompt`, `state().systemPrompt`)
 * and refuses `system_prompt`, a hand-off, before anything is posted: a click whose hit-tested target is a prompt's
 * element, and every key while a prompt can take keys. Only a capture reply clears the mark; an older helper changes
 * nothing.
 * `planBatch(actions)` refuses a batch at plan time, before anything reaches the helper.
 *
 * **The settle after a human resume (helper-protocol-details.md 0.4.1-0.4.2).** The owner may work through Screen
 * Sharing, so the Resume, Hand back or Approve click that returns the run to `running` is itself local input, and the
 * pointer movement right after it would pause the run again at once - a resume loop. So the first `input` request
 * after run control enters `running` from `paused`, `taken_over` or `awaiting_consent` carries `settleMs`, and only
 * that one: not later inputs, and not the first input of a run that never left `running`. The flag is spent when that
 * request is formed, whether the helper answers it or the link refuses it before sending; a planning, gate or target
 * refusal forms no request and leaves it for the next. The helper waits up to `SETTLE_CAP_MS` for the hands-off time,
 * so that request's deadline is the link's request timeout plus the cap: a timeout would end the link while the helper
 * waits.
 * The helper's guards stay armed through the wait (helper 0.2.8, design 0.4.2), so a person still at the Mac is
 * reported as `localInput` while it lasts; that input is what the settle waits out, so while the settling request is
 * outstanding such an event sets no stop, asks run control for no pause and is not reported to listeners - it is only
 * counted (`settleLocalInputs`). Otherwise every resume through Screen Sharing would pause again at the first drift.
 * The helper's answer past the cap, `local_input` at step 0, is stopped like any local input: the driver's stop holds
 * and run control is asked to pause from `local_input` (C4). So is a `local_input` stop at a later step - the person's
 * input after the wait, while the helper posts; only a report after its last step's check and before its reply goes
 * unheeded, and the guards report a person who carries on again. Once the request is answered, every `localInput` is
 * handled as before.
 */

export const SITE = 'desktop:macos-local'
/** CU-100: the first capture waits up to this long for an approved app's window, looking every APP_WINDOW_POLL_MS. */
export const APP_WINDOW_WAIT_MS = 5000
export const APP_WINDOW_POLL_MS = 500
/**
 * CU-201: how long a click on a menu item waits, after its input, for the menu to close before perform resolves. While
 * the menu is still tracking (an item fires ~555 ms after the click, as the loop's settle measured), the next click of
 * the same batch is consumed by the closing menu - cu-verifier's run pasted back into the source entry - so the batch's
 * next action, and its target read, must meet the real window. Abortable; bounded by MENU_CLOSE_CAP_MS.
 */
export const MENU_CLOSE_MS = 800
const MENU_CLOSE_CAP_MS = 5000
/** An older helper's refusal of an empty window filter, as the run's error shows it since #232 (16:14Z, helper 0.2.31). */
export const OLDER_HELPER_NO_IMAGE = '(failed: the capture returned no image)'

/** CU-100: the run's named stop when no approved app has a window on screen; never helper_lost. */
function noAppWindowError(scope) {
  const apps = [...(scope ?? [])]
  return new EnvironmentError('no_app_window', `no window of ${apps.join(', ') || 'an approved app'} is on screen (not running, every window closed, minimized or hidden, or on another Space or display); open it and run again`, { apps })
}
const BUNDLE_ID = /^[A-Za-z0-9][A-Za-z0-9.-]{0,254}$/
const MAX_APPS = 32
const PAGE_TEXT_MAX = 20_000
const BYE_TIMEOUT_MS = 2000

/**
 * The refusal for an excluded app, or null. A check that throws counts as excluded: an app is only ever put in scope
 * when the exclusions positively say it may be.
 */
function excludedRefusal(exclusions, bundleId) {
  let verdict
  try {
    verdict = exclusions.isExcludedApp(bundleId)
  } catch {
    verdict = { excluded: true, kind: 'unknown' }
  }
  if (verdict?.excluded === false) return null
  const kind = typeof verdict?.kind === 'string' ? verdict.kind : 'unknown'
  return new EnvironmentError('blocked_by_policy', `${bundleId} is excluded (${kind}) and is never in scope`, { reason: 'excluded', bundleId, kind })
}

/**
 * The refusal for a member that needs an approved app before any has joined (P11). The code and reason are what the
 * helper's own `no_scope` maps to (`replyError`), so the answer does not depend on whether the helper was asked; the
 * text tells the model this waits on a person's approval, not on anything it could retry.
 */
export function noScopeRefusal() {
  return new EnvironmentError('out_of_scope', 'no app is in this run\'s scope yet: nothing is captured, inspected or posted until a person approves an app and it joins the scope', { reason: 'no_scope' })
}

/**
 * The refusal for a pointer action whose point is over an app outside the run's scope (D-036). The message the model
 * reads never names that app (CU-38, CU-47: the covering app's identity goes to the person and the trajectory only);
 * `details.bundleId` carries it for them, and `point` is the global point that was hit-tested. `bundleId` is null only
 * when the helper refused the hit test itself as out of scope.
 */
function targetOutOfScope(bundleId, point) {
  const message = 'the action would land on a window of an app this run is not approved for; nothing was posted - a person must approve that app before the agent acts in it'
  return new EnvironmentError('out_of_scope', message, { reason: 'target_out_of_scope', bundleId, point: { x: point.x, y: point.y } })
}

/**
 * CU-64 G1: a releasedStale event (helper 0.2.30) as {keys, buttons, posted} - keys by canonical name (SHIFT, META),
 * buttons by name, posted the ups the helper sent - or null when nothing was left down.
 */
function releasedStaleOf(stale) {
  if (stale === null || typeof stale !== 'object') return null
  const keys = Array.isArray(stale.keys) ? stale.keys.filter(Number.isInteger).map(keyName) : []
  const buttons = Array.isArray(stale.buttons) ? stale.buttons.filter((b) => typeof b === 'string') : []
  const posted = Number.isInteger(stale.posted) ? stale.posted : null
  return keys.length > 0 || buttons.length > 0 ? Object.freeze({ keys, buttons, posted }) : null
}

/**
 * CU-64 G1: every key (canonical name) and button a plan puts down. If the link dies mid-request the driver cannot know
 * at which step, so any of them may still be held - the honest report is all of them, each once.
 */
function mayBeHeld(events) {
  const keys = new Set()
  const buttons = new Set()
  for (const event of events) {
    if (event.kind === 'keyDown') keys.add(event.keyCode)
    if (event.kind === 'down') buttons.add(event.button)
  }
  return { keys: [...keys].map(keyName), buttons: [...buttons] }
}

/**
 * CU-76: a system-presented privacy or permission prompt (Allow Paste, a TCC prompt), even inside an approved app's
 * window, is the person's to answer - a click on it, or a key while it shows (Return or Space would answer it), is
 * refused before anything is posted. `point` is the target's global point, null for a key step.
 */
function systemPromptRefusal(point) {
  const message = point === null
    ? 'a system privacy or permission prompt is showing, so no key was posted; answering it is the person\'s'
    : 'the target is part of a system privacy or permission prompt, so nothing was posted; answering it is the person\'s'
  return new EnvironmentError('system_prompt', message, point === null ? {} : { point: { x: point.x, y: point.y } })
}

/** The refusal for a pointer action whose target app could not be established (D-036): the check never fails open. */
function targetUnverified(point, why, extra = {}) {
  return new EnvironmentError('out_of_scope', `the app under the pointer could not be verified as approved (${why}); nothing was posted`, {
    reason: 'target_unverified', bundleId: null, point: { x: point.x, y: point.y }, ...extra,
  })
}

/**
 * Hit-test refusals the target check passes on unchanged: each already means nothing is posted and says why more
 * exactly than `target_unverified` would - the grant to name, a link that is gone, a run that was stopped.
 */
const PASS_THROUGH = Object.freeze(['not_granted', 'helper_lost', 'closed', 'cancelled'])

/** The socket peer-check options as given; only the socket path reads them (a `connect` seam has no peer to check). */
function checkPeerOptions(options) {
  const { peerCheck, helperExecutable, helperRequirement } = options
  if (peerCheck !== undefined && !PEER_CHECKS.includes(peerCheck)) throw invalid(`peerCheck is one of ${PEER_CHECKS.join(', ')}`)
  if (helperExecutable !== undefined && (typeof helperExecutable !== 'string' || !isAbsolute(helperExecutable))) throw invalid('helperExecutable must be an absolute path')
  if (helperRequirement !== undefined && (typeof helperRequirement !== 'string' || helperRequirement.length === 0 || /[\n\r\0]/.test(helperRequirement))) {
    throw invalid('helperRequirement must be one line of code requirement text')
  }
  for (const name of ['identifyPeer', 'verifyPeer', 'peerLog']) {
    if (options[name] !== undefined && typeof options[name] !== 'function') throw invalid(`${name} must be a function`)
  }
}

/**
 * The pre-grant boundary flags (see `launch.mjs`): `enforceBoundary` a boolean, `lockPath` an absolute path and only
 * with it - the helper refuses `--lock-path` alone - and both only on the socket path, where there is a launch to
 * carry them; a check that silently did not happen would be worse than a refusal.
 */
function checkBoundaryOptions({ enforceBoundary, lockPath, connect }) {
  if (enforceBoundary !== undefined && typeof enforceBoundary !== 'boolean') throw invalid('enforceBoundary is true or false')
  if (lockPath !== undefined) {
    if (enforceBoundary !== true) throw invalid('lockPath goes with enforceBoundary: the helper honours --lock-path only for an enforced boundary')
    if (typeof lockPath !== 'string' || !isAbsolute(lockPath) || /[\n\r\0]/.test(lockPath)) throw invalid('lockPath must be an absolute path')
  }
  if (enforceBoundary === true && typeof connect === 'function') throw invalid('enforceBoundary goes with the socket path; a connect seam launches no helper to pass it to')
}

/** `heldMarkerPath`: an absolute path, and only on the socket path, where a launch carries it (as the boundary flags). */
function checkHeldMarkerPath({ heldMarkerPath, connect }) {
  if (heldMarkerPath === undefined) return
  if (typeof heldMarkerPath !== 'string' || !isAbsolute(heldMarkerPath) || /[\n\r\0]/.test(heldMarkerPath)) throw invalid('heldMarkerPath must be an absolute path')
  if (typeof connect === 'function') throw invalid('heldMarkerPath goes with the socket path; a connect seam launches no helper to pass it to')
}

/**
 * The adapter's image limits, checked by the fit itself on a unit area: the launch fits the frame to them, so a limit
 * `fitFactor` would refuse is refused with the other options, before the lock is taken or a helper is started.
 */
function checkLimits(limits) {
  if (limits === undefined || limits === null) return
  if (typeof limits !== 'object' || Array.isArray(limits)) throw invalid('frame holds the adapter\'s image limits, an object')
  fitFactor({ width: 1, height: 1 }, 1, limits)
}

function checkOptions(options) {
  const { apps = [], mode = 'global', seat, simulateScale, simulateDisplay, refitFrameAtFirstApp = false, captureDir, runLockDir } = options
  if (!Array.isArray(apps) || apps.length > MAX_APPS) throw invalid(`apps lists 0 to ${MAX_APPS} candidate bundle ids`)
  for (const app of apps) if (typeof app !== 'string' || !BUNDLE_ID.test(app)) throw invalid(`'${String(app)}' is not a bundle id`)
  const exclusions = options.exclusions ?? createExclusions()
  if (exclusions === null || typeof exclusions !== 'object' || typeof exclusions.isExcludedApp !== 'function') throw invalid('exclusions must be agent core\'s createExclusions() object')
  if (mode !== 'global' && mode !== 'pid') throw invalid('mode is global or pid')
  if (typeof seat !== 'string' || !SEAT_PATTERN.test(seat)) throw invalid('seat must be a [cu] seat key such as cu-developer-two')
  const runId = options.runId ?? options.control?.runId ?? `desktop-${randomBytes(4).toString('hex')}`
  if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId)) throw invalid('runId must be letters, digits and . _ : - (at most 128)')
  if (simulateScale !== undefined && !(typeof simulateScale === 'number' && simulateScale > 1 && simulateScale <= MAX_SIMULATE_SCALE)) {
    throw invalid(`simulateScale must be a number above 1 and at most ${MAX_SIMULATE_SCALE}`)
  }
  if (typeof refitFrameAtFirstApp !== 'boolean') throw invalid('refitFrameAtFirstApp must be true or false', { field: 'refitFrameAtFirstApp' })
  const side = (value) => Number.isInteger(value) && value >= 320 && value <= 8192
  if (simulateDisplay !== undefined && (simulateDisplay === null || typeof simulateDisplay !== 'object' || !side(simulateDisplay.width) || !side(simulateDisplay.height))) {
    throw invalid('simulateDisplay must be {width, height}, whole points from 320 to 8192', { field: 'simulateDisplay' })
  }
  // Above the helper's cap a settle could never finish after a person's input; null is a mistake, not the default.
  const settleMs = options.settleMs === undefined ? SETTLE_MS : options.settleMs
  if (!Number.isInteger(settleMs) || settleMs < 1 || settleMs > SETTLE_CAP_MS) throw invalid(`settleMs must be a whole number of milliseconds from 1 to ${SETTLE_CAP_MS}`, { field: 'settleMs' })
  // D-066: a run that posts nothing says so - exempt from the owner-idle check, and refused any input; passed to the
  // lock only when set.
  const noInput = options.noInput ?? false
  if (typeof noInput !== 'boolean') throw invalid('noInput is true or false', { field: 'noInput' })
  // CU-201: the wait after a menu item's click (0 turns it off - a test seam).
  const menuCloseMs = options.menuCloseMs === undefined ? MENU_CLOSE_MS : options.menuCloseMs
  if (!Number.isInteger(menuCloseMs) || menuCloseMs < 0 || menuCloseMs > MENU_CLOSE_CAP_MS) throw invalid(`menuCloseMs must be a whole number of milliseconds from 0 to ${MENU_CLOSE_CAP_MS}`, { field: 'menuCloseMs' })
  // CU-100: how long the first capture waits for an approved app's window, and how often it looks (a test seam).
  const appWindowWaitMs = options.appWindowWaitMs === undefined ? APP_WINDOW_WAIT_MS : options.appWindowWaitMs
  const appWindowPollMs = options.appWindowPollMs === undefined ? APP_WINDOW_POLL_MS : options.appWindowPollMs
  for (const [field, value] of [['appWindowWaitMs', appWindowWaitMs], ['appWindowPollMs', appWindowPollMs]]) {
    if (!Number.isInteger(value) || value < 1 || value > 60_000) throw invalid(`${field} must be a whole number of milliseconds from 1 to 60000`, { field })
  }
  if (options.runLock !== undefined && typeof options.runLock !== 'function') throw invalid('runLock must be a function like acquireDesktopRun')
  if (runLockDir !== undefined) {
    if (options.runLock !== undefined) throw invalid('runLockDir is a shorthand for runLock; give one of them, not both')
    if (typeof runLockDir !== 'string' || !isAbsolute(runLockDir)) throw invalid('runLockDir must be an absolute path')
  }
  if (captureDir !== undefined) {
    if (typeof options.connect !== 'function') throw invalid('captureDir goes with connect; on the socket path the run directory is the socket\'s')
    if (typeof captureDir !== 'string' || !isAbsolute(captureDir)) throw invalid('captureDir must be an absolute path')
    let ok = false
    try { ok = isPrivateDir(captureDir) } catch { ok = false }
    if (!ok) throw invalid('captureDir must be a private directory (mode 700, owned by this user)')
  }
  checkPeerOptions(options)
  checkBoundaryOptions(options)
  checkHeldMarkerPath(options)
  checkLimits(options.frame)
  // Candidates are not checked against the exclusions here: none is sent at launch, agent core skips an excluded one,
  // and `addApp` refuses it by name should anything ask.
  const runLock = options.runLock ?? (runLockDir !== undefined ? (args) => acquireDesktopRun({ ...args, dir: runLockDir }) : acquireDesktopRun)
  return { appWindowWaitMs, appWindowPollMs, candidates: [...new Set(apps)], mode, seat, runId, simulateScale: simulateScale ?? null, simulateDisplay: simulateDisplay === undefined ? null : { width: simulateDisplay.width, height: simulateDisplay.height }, refitFrameAtFirstApp, captureDir: captureDir ?? null, exclusions, runLock, settleMs, noInput, menuCloseMs }
}

/**
 * Take the desktop-run lock through `acquire` (default `acquireDesktopRun`). Its own refusals pass through unchanged,
 * keeping `details.reason` and `details.holder`; anything else it throws becomes `resource_refused` without its text
 * (a filesystem error names paths). A slot without `release` is refused rather than trusted.
 */
async function holdDesktopRun(acquire, { seat, runId, noInput = false, confirmWith, task = '' }) {
  let slot
  try {
    slot = await acquire({ seat, runId, ...(noInput ? { noInput } : {}), ...(confirmWith !== undefined ? { confirmWith, task } : {}) })
  } catch (error) {
    if (error instanceof EnvironmentError) throw error
    throw new EnvironmentError('resource_refused', 'the desktop-run lock could not be taken', { reason: typeof error?.reason === 'string' ? error.reason : (error?.code ?? 'refused') })
  }
  if (slot === null || typeof slot !== 'object' || typeof slot.release !== 'function') {
    throw new EnvironmentError('resource_refused', 'the desktop-run lock did not grant the run')
  }
  let released = false
  const release = () => {
    if (released) return
    released = true
    try { slot.release() } catch { /* a lock that throws on release is gone already; the exit hook remains */ }
  }
  // CU-204: the lock's record of this seat's last input, best effort - a missed note can only make a later run inside
  // the hold refuse (the safe side), never admit one.
  release.noteInput = typeof slot.noteInput === 'function' ? () => { try { slot.noteInput() } catch { /* best effort */ } } : () => {}
  return release
}

/**
 * Start the real helper: a private socket directory, then LaunchServices; resolves with the accepted link. The peer
 * check is `require` unless the caller says otherwise, and expects the executable of the very bundle `open` is given.
 * The helper is told which node and entry script this driver is (its own peer check, D-029 a), and the pre-grant
 * boundary flags when asked for. A helper that closes before any hello refused this driver or died; the error then
 * says what about this process such a check refuses, by variable name and count only.
 */
async function connectViaSocket(options) {
  const home = options.cuHome ?? cuHome()
  const bundlePath = options.bundlePath ?? defaultBundlePath(home)
  const peerCheck = options.peerCheck ?? 'require'
  // Before the server exists: a process with no entry script cannot be named to the helper, so nothing is made.
  const { driverNode, driverEntry } = driverIdentity()
  const pass = (names) => Object.fromEntries(names.filter((name) => options[name] !== undefined).map((name) => [name, options[name]]))
  const server = await createHelperServer({
    parentDir: options.runDir ?? join(home, 'run'),
    ...pass(['helloTimeoutMs', 'requestTimeoutMs', 'helperRequirement', 'identifyPeer', 'verifyPeer', 'peerLog']),
    peerCheck,
    ...(peerCheck !== 'off' ? { helperExecutable: options.helperExecutable ?? helperExecutablePath(bundlePath) } : {}),
  })
  try {
    const launch = options.launch ?? ((args) => launchHelper({ ...args, ...(options.spawn ? { spawn: options.spawn } : {}) }))
    const accepted = server.accept(options.connectTimeoutMs !== undefined ? { timeoutMs: options.connectTimeoutMs } : {})
    accepted.catch(() => {})
    await launch({
      bundlePath, socketPath: server.socketPath, tokenPath: server.tokenPath, driverNode, driverEntry,
      ...(options.enforceBoundary === true ? { enforceBoundary: true, ...pass(['lockPath']) } : {}),
      ...pass(['heldMarkerPath']),
    })
    return { link: await accepted, server }
  } catch (error) {
    await server.close()
    if (error instanceof EnvironmentError && error.details?.reason === 'no_hello') error.details = { ...error.details, driver: driverLaunchProblems() }
    throw error
  }
}

/** CU-203: the link's wait for confirmPhysical beyond the prompt's own cap, so the helper's own timeout reply arrives. */
export const CONFIRM_LINK_MARGIN_MS = 10_000

/**
 * CU-203 (physical-confirmation.md, Flow 2): the channel the run lock asks over, only when the run's starter asked for
 * it (`askOwner`). The lock calls it after an owner_active refusal and never otherwise - a noInput run is exempt before
 * any idle check, so it is never asked; only then is the helper launched, with no scope set, and its link becomes the run's own afterwards. The
 * channel carries no verdict: it sends one confirmPhysical request and hands the lock the helper's reply, or the
 * helper's own refusal code (busy, no_display, unsupported, unknown_request, timeout) as a failure.
 */
function confirmChannel(options, early) {
  return async (request) => {
    if (early.value === null) {
      early.value = typeof options.connect === 'function' ? { link: await options.connect(), server: null } : await connectViaSocket(options)
    }
    try {
      return await early.value.link.request('confirmPhysical', request, { timeoutMs: request.timeoutMs + CONFIRM_LINK_MARGIN_MS })
    } catch (error) {
      const code = typeof error?.details?.reason === 'string' ? error.details.reason : error?.code === 'unsupported_action' ? 'unsupported' : error?.code
      throw Object.assign(new Error('the helper did not confirm'), { code: typeof code === 'string' ? code : 'error' })
    }
  }
}

/**
 * CU-227: where a helper's end watchdog writes stopped.json - beside the held-keys marker (the live helper's default
 * marker, or the `heldMarkerPath` a launch passes), or at `stoppedMarkerPath` (absolute; the test seam, allowed with a
 * `connect` seam). A `connect` seam without one reads none.
 */
function stoppedMarkerPathOf(options) {
  if (options.stoppedMarkerPath !== undefined) {
    if (typeof options.stoppedMarkerPath !== 'string' || !isAbsolute(options.stoppedMarkerPath) || /[\n\r\0]/.test(options.stoppedMarkerPath)) throw invalid('stoppedMarkerPath must be an absolute path', { field: 'stoppedMarkerPath' })
    return options.stoppedMarkerPath
  }
  if (typeof options.connect === 'function') return null
  const marker = typeof options.heldMarkerPath === 'string' ? options.heldMarkerPath : join(homedir(), '.computer-use', 'helper', 'held-keys.json')
  return join(dirname(marker), 'stopped.json')
}

export async function launchDesktopEnvironment(options = {}) {
  const { candidates, mode, seat, runId, simulateScale, simulateDisplay, refitFrameAtFirstApp, captureDir, exclusions, runLock, settleMs, noInput, menuCloseMs, appWindowWaitMs, appWindowPollMs } = checkOptions(options)
  if (options.askOwner !== undefined && typeof options.askOwner !== 'boolean') throw invalid('askOwner is true or false', { field: 'askOwner' })
  if (options.task !== undefined && typeof options.task !== 'string') throw invalid('task is the run\'s task text', { field: 'task' })
  const early = { value: null }
  let releaseRun
  try {
    releaseRun = await holdDesktopRun(runLock, { seat, runId, noInput, ...(options.askOwner === true ? { confirmWith: confirmChannel(options, early), task: options.task ?? '' } : {}) })
  } catch (error) {
    if (early.value !== null) {
      try { early.value.link.close?.() } catch { /* already closed */ }
      await early.value.server?.close()
    }
    throw error
  }
  let link
  let server = null
  try {
    if (early.value !== null) ({ link, server } = early.value)
    else if (typeof options.connect === 'function') link = await options.connect()
    else ({ link, server } = await connectViaSocket(options))
  } catch (error) {
    releaseRun()
    throw error
  }
  // CU-227: a stopped.json left by an earlier helper is removed unread; one this run's helper writes is read when its link
  // is lost, and the run ends helper_lost with details.stopped.
  const stoppedPath = stoppedMarkerPathOf(options)
  if (stoppedPath !== null && link !== null && typeof link === 'object') {
    readStoppedMarker(stoppedPath, { since: Number.POSITIVE_INFINITY })
    const since = Date.now()
    link.stoppedProbe = () => readStoppedMarker(stoppedPath, { since })
  }
  let env
  try {
    env = new DesktopEnvironment({
      link, server, candidates, mode, control: options.control, signal: options.signal ?? options.control?.signal, limits: options.frame ?? {},
      releaseRun, run: { seat, runId }, simulateScale, simulateDisplay, refitFrameAtFirstApp, captureDir: server?.dir ?? captureDir, exclusions, settleMs, noInput, menuCloseMs,
      appWindowWaitMs, appWindowPollMs,
    })
  } catch (error) {
    // Only a `connect` seam that resolved with something other than a link gets here.
    try { link?.close?.() } catch { /* not a link */ }
    await server?.close()
    releaseRun()
    throw error
  }
  try {
    await env.start()
    return env
  } catch (error) {
    await env.close()
    throw error
  }
}

function abortable(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new EnvironmentError('cancelled', 'the run was cancelled'))
    const onAbort = () => {
      clearTimeout(timer)
      reject(new EnvironmentError('cancelled', 'the run was cancelled'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

const same = (a, b) => Math.abs(a - b) < 1e-6

/** Generic AX roles that, unnamed, say nothing about what acting on them does (input-and-targets.md). */
export const OPAQUE_ROLES = Object.freeze(['AXUnknown', 'AXGroup', 'AXWindow', 'AXScrollArea'])
/** CU-194: the AX roles agent core reads as a text entry (policy.mjs isTextEntry) - the elements a fieldKey goes on. */
const ENTRY_ROLES = Object.freeze(['AXTextField', 'AXSecureTextField', 'AXTextArea', 'AXSearchField', 'AXComboBox'])
/** CU-194: the helper's windowOrigin ({ x, y }, global top-left points), or null when absent or malformed. */
const pointOf = (value) => (value !== null && typeof value === 'object' && Number.isFinite(value.x) && Number.isFinite(value.y) ? { x: value.x, y: value.y } : null)
const KEY_STEPS = new Set(['keyDown', 'keyUp', 'text'])
/**
 * The run-control states a return to `running` from makes the next input settle (design 0.4.1): each ends with a
 * person's click - Resume, Hand back, Approve - that may come through Screen Sharing as local input.
 */
export const SETTLE_AFTER = Object.freeze(['paused', 'taken_over', 'awaiting_consent'])

/**
 * The hello's grants as this run knows them: each a boolean, or null when the helper did not report it (one from
 * before design 0.3 has no `postEvents`); unknown is never read as granted.
 */
function grantsOf(hello) {
  return Object.freeze(Object.fromEntries(HELLO_GRANTS.map((name) => [name, typeof hello?.grants?.[name] === 'boolean' ? hello.grants[name] : null])))
}

/** Said when a held button came up after a stop (helper 0.2.20, CU-45): the app may have acted on that release. */
const RELEASE_NOTE = 'a held button came up after the stop, so the app may have acted on it - check before retrying'

/**
 * The global point where a stopped drag's button came up (helper 0.2.20, CU-45), and whether that was its press point
 * (within 1 pt), as details, or nothing. Agent core cannot compare the model's frame-pixel path with screen points on a
 * failure, so the driver, which knows both, says it: `releasedAtPress: false` means the drop may have happened.
 */
function releasedAt(reply, events = []) {
  const at = reply.releasedAt
  if (at === null || typeof at !== 'object' || !Number.isFinite(at.x) || !Number.isFinite(at.y)) return {}
  const press = events.find((event) => event.kind === 'down')
  const atPress = press !== undefined && Math.abs(press.x - at.x) <= 1 && Math.abs(press.y - at.y) <= 1
  return { releasedAt: { x: at.x, y: at.y }, releasedAtPress: atPress }
}

/**
 * CU-148: the app whose window the helper read when no element holds the focus (reply.app, `{ bundleId, pid }`), as
 * the element fields #describe takes, so the placeholder target names its app: app-policy fails closed on a target
 * that names none (excluded:unknown). Empty when the helper does not say, which leaves the placeholder blocked.
 */
function appOf(value) {
  if (typeof value?.bundleId !== 'string' || value.bundleId.length === 0) return {}
  return { bundleId: value.bundleId, ...(Number.isSafeInteger(value.pid) && value.pid > 0 ? { pid: value.pid } : {}) }
}

/**
 * CU-151: the pasteboard's change count at this read (NSPasteboard.general.changeCount, a number, never content: D-031
 * keeps the pasteboard unread), as the helper reports it beside the focused element and the element at a point. Agent
 * core records it before the run's own copy or cut and compares it when it judges a paste: the paste is the run's own
 * text only if the count rose by exactly the run's own copies. A non-negative integer, or null when the helper does not
 * say (an older helper) or says something else. Read fresh with every target, never cached: a copy writes the
 * pasteboard after its key event, so only a later read sees the rise. Outside the fingerprint.
 */
function changeCountOf(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

/**
 * CU-157: whether any text entry in the target's window (and any sheet on it) holds text, as the helper reports it
 * beside the element from character counts only (AXNumberOfCharacters, never AXValue: D-060) - a strict boolean, or null
 * when the helper does not say (an older helper) or could not read part of the window (a secure field, web content, an
 * entry without a count). Agent core lets a bare 'Reply' run only on a strict false (reply-text-entered.md, #374). Read
 * fresh with every target, outside the fingerprint. Unlike the browser, whitespace-only text counts as text here: a
 * count cannot tell it apart without reading the value - an over-ask, the safe side, and a named asymmetry.
 */
function textEnteredOf(value) {
  return typeof value === 'boolean' ? value : null
}

/**
 * CU-190: whether the helper could read the default button where the focus is - its strict true (the walk reached a
 * sheet or window and read AXDefaultButton: a button, or positively none) or strict false (a read failed, the focus was
 * unreadable, Accessibility not granted). Anything else reads as false (CU-215): every helper the link accepts sends
 * the strict boolean (D-069's floor, 0.2.44; Dispatcher.swift puts it in every focused reply), so a missing or malformed
 * field is a deviation, not an older helper - and read as null it made no placeholder, so a Return with nothing focused
 * went unasked. False makes the placeholder and agent core asks, as for any read that failed.
 */
function defaultButtonReadOf(value) {
  return value === true
}

/**
 * CU-148: whether a sheet or an alert is where the focus is (the focused window holds an AXSheet, the focus lies in one,
 * or the frontmost window is an alert), as the helper reports it: a strict boolean. Null when the helper does not say
 * (an older helper), so agent core keeps its present rule for Command-D, a named limit. With keyboard navigation off
 * the focus is the window itself, so only this says that a Command-D would answer a Don't Save sheet. Context, not
 * identity: outside the fingerprint.
 */
function sheetOf(value) {
  return typeof value === 'boolean' ? value : null
}

/**
 * CU-142: the default button the helper reports beside the focused element - `{ role, name, panel }` with a non-empty
 * role, or null. Only names that Return could press are kept: no frame, no owner, nothing agent core does not judge.
 */
function defaultButtonOf(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const text = (v) => typeof v === 'string' && v.length > 0 ? v : null
  const role = text(value.role)
  if (role === null) return null
  return { role, name: text(value.title), panel: panelOf(value.panel) }
}

/**
 * CU-154: a menu item's key equivalent as the helper reads it - `char` (AXMenuItemCmdChar: a short string, no
 * control characters) and `modifiers` (AXMenuItemCmdModifiers: an integer 0-15 - Command alone is 0; +1 Shift,
 * +2 Option, +4 Control, +8 no Command). A part that is malformed is null; nothing usable at all is null.
 */
/**
 * CU-361 (cu-researcher): a layout label as placeholderOf reads it, except that text the value rules class as sensitive
 * (a card, an IBAN, a bank account: policy.mjs looksSensitive) is a displayed value, not a label, and reads as none - so
 * a summary screen's 'Card 4111...' beside a box never becomes a name anywhere.
 */
export function nearbyLabelOf(value) {
  const text = placeholderOf(value)
  return text !== null && looksSensitive(text) === null ? text : null
}

/**
 * CU-372 (helper 0.2.65): a pop-up button's menu as the helper read it closed - `{ items: [{ title, enabled }], selected,
 * selectedIndex }`, or `{ unread: true, selected }`; null when absent (an older helper, another role). Anything malformed
 * reads as unread, never as an empty list (unread asks). Outside the fingerprint, and never in run records.
 */
export function popUpOf(value) {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return null
  const selected = typeof value.selected === 'string' && value.selected.trim() !== '' ? value.selected.trim().slice(0, 80) : null
  // A pull-down button (pullsDown: its title a label, Return or Space opening a menu of actions) keeps the mark either way.
  const pull = value.pullsDown === true ? { pullsDown: true } : {}
  const unread = { unread: true, selected, ...pull }
  if (value.unread === true || !Array.isArray(value.items) || value.items.length === 0 || value.items.length > 50) return unread
  const items = []
  for (const item of value.items) {
    if (item === null || typeof item !== 'object' || typeof item.title !== 'string' || item.title.trim() === '') return unread
    items.push({ title: item.title.trim().slice(0, 80), enabled: item.enabled !== false })
  }
  // cu-researcher: a selected title two items share leaves an arrow's neighbour unknown - unread, as the helper says.
  if (selected !== null && items.filter((item) => item.title === selected).length > 1) return unread
  const index = value.selectedIndex
  const known = value.pullsDown !== true && Number.isInteger(index) && index >= 0 && index < items.length && items[index].title === selected
  return { items, selected, selectedIndex: known ? index : null, ...pull }
}

/**
 * CU-372: the items a typed string may select in a closed pop-up button, in menu order - conservatively every enabled
 * item whose title starts (case-insensitively) with any prefix of the typed text, not only AppKit's first match (named
 * over-ask). [] when none matches (the button keeps its item); `{ unread: true }` for an unread menu.
 */
export function popUpTypeItems(popUp, text) {
  if (popUp === null || popUp.unread === true || popUp.pullsDown === true) return { unread: true }
  const typed = String(text ?? '').toLocaleLowerCase()
  const prefixes = []
  for (let end = 1; end <= typed.length; end += 1) prefixes.push(typed.slice(0, end))
  return popUp.items.filter((item) => item.enabled && prefixes.some((prefix) => item.title.toLocaleLowerCase().startsWith(prefix)))
}

/**
 * CU-372: the item one plain key lands on in a closed pop-up button, from its selected item - Down/Right the next
 * enabled item, Up/Left the previous, Home the first, End the last (no wrap); a letter or digit the one enabled item it
 * type-selects, unread when several could. PageUp/PageDown and an unknown selected index read as unread (they ask).
 * Returns `{ item }`, `{ unread: true }`, or null when the key chooses nothing (the focus stays the target).
 */
export function popUpKeyItem(popUp, key) {
  if (popUp === null || popUp.unread === true || popUp.pullsDown === true) return { unread: true }
  const enabled = popUp.items.map((item, index) => ({ item, index })).filter(({ item }) => item.enabled)
  if (/^[A-Z0-9]$/.test(key)) {
    const matches = enabled.filter(({ item }) => item.title.toLocaleUpperCase().startsWith(key))
    if (matches.length === 0) return null
    return matches.length === 1 ? { item: matches[0].item } : { unread: true }
  }
  if (key === 'HOME' || key === 'END') {
    if (enabled.length === 0) return null
    return { item: (key === 'HOME' ? enabled[0] : enabled[enabled.length - 1]).item }
  }
  if (key === 'PAGEUP' || key === 'PAGEDOWN') return { unread: true }
  const down = key === 'ARROWDOWN' || key === 'ARROWRIGHT'
  if (!down && key !== 'ARROWUP' && key !== 'ARROWLEFT') return null
  if (popUp.selectedIndex === null) return { unread: true }
  const next = down ? enabled.find(({ index }) => index > popUp.selectedIndex) : enabled.filter(({ index }) => index < popUp.selectedIndex).pop()
  return next === undefined ? null : { item: next.item }
}

/** CU-372: the roles that carry a closed menu - a pop-up button, and a pull-down (AppKit's AXMenuButton). */
const POPUP_ROLES = ['AXPopUpButton', 'AXMenuButton']

/** CU-372: a pop-up button's menu item as a target - the button's own context, the item's title as its name, marked as a choice. */
function popUpItemTarget(focus, item) {
  const { popUp, fieldKey, placeholder, nearbyLabel, ...context } = focus
  const fingerprint = createHash('sha256').update(`${focus.fingerprint}|popUpItem=${item.title}`).digest('hex').slice(0, 32)
  return { ...context, role: 'AXMenuItem', subrole: null, name: item.title, editable: false, placeholder: null, nearbyLabel: null, selectOption: true, fingerprint }
}

/** CU-349: a placeholder string, trimmed, at most 80 characters (longer is none, never cut), else null. */
export function placeholderOf(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text !== '' && text.length <= 80 ? text : null
}

function keyEquivalentOf(value) {
  if (value === null || typeof value !== 'object') return null
  const char = typeof value.char === 'string' && value.char.length >= 1 && value.char.length <= 4 && !/[\u0000-\u001F\u007F]/u.test(value.char) ? value.char : null
  const modifiers = Number.isInteger(value.modifiers) && value.modifiers >= 0 && value.modifiers <= 15 ? value.modifiers : null
  return char === null && modifiers === null ? null : { char, modifiers }
}

/** CU-236: a menu title or path step as passed on - trimmed, at most 80 characters, no control characters; else null. */
function menuTitleOf(value) {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text !== '' && !/[\u0000-\u001F\u007F]/u.test(text) ? text.slice(0, 80) : null
}

/**
 * CU-236: a bound item's key equivalent - `char` (AXMenuItemCmdChar), or `glyph` (AXMenuItemCmdGlyph, an integer code for
 * Delete, Return, arrows, F-keys) and `virtualKey` (AXMenuItemCmdVirtualKey), and `modifiers` (AXMenuItemCmdModifiers, 0-15 as keyEquivalentOf reads it). Null when
 * neither a char nor a glyph is usable.
 */
function menuKeyEquivalentOf(value) {
  const base = keyEquivalentOf(value)
  const glyph = Number.isSafeInteger(value?.glyph) && value.glyph > 0 && value.glyph < 0x10000 ? value.glyph : null
  // AXMenuItemCmdVirtualKey (helper 0.2.52): the kVK code of a non-character key equivalent, 0-127.
  const virtualKey = Number.isSafeInteger(value?.virtualKey) && value.virtualKey >= 0 && value.virtualKey <= 127 ? value.virtualKey : null
  if (base?.char == null && glyph === null && virtualKey === null) return null
  return { char: base?.char ?? null, ...(glyph !== null ? { glyph } : {}), ...(virtualKey !== null ? { virtualKey } : {}), modifiers: base?.modifiers ?? null }
}

/** CU-236: the most items one answer may carry (cu-developer-one's decision; the helper caps its list there too). */
export const MAX_BOUND_ITEMS = 8

/** One entry of a menuKey list as passed on, or null when it is malformed or untitled. */
function boundEntryOf(item, scope) {
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return null
  if (item.bundleId !== undefined && (typeof item.bundleId !== 'string' || !scope.includes(item.bundleId))) return null
  if (item.appleMenu !== undefined && typeof item.appleMenu !== 'boolean') return null
  // CU-250 (helper 0.2.53): an item under the Services menu acts outside the approved app; app-policy refuses it.
  if (item.servicesMenu !== undefined && typeof item.servicesMenu !== 'boolean') return null
  const name = menuTitleOf(item.title)
  if (name === null) return null
  const path = Array.isArray(item.path) ? item.path.slice(0, 8).map(menuTitleOf).filter((step) => step !== null) : []
  return {
    role: 'AXMenuItem', name, keyEquivalent: menuKeyEquivalentOf(item.keyEquivalent), path,
    enabled: typeof item.enabled === 'boolean' ? item.enabled : null,
    ...(item.appleMenu === true ? { appleMenu: true } : {}),
    ...(item.servicesMenu === true ? { servicesMenu: true } : {}),
  }
}

/** Entries deduplicated by what agent core judges (name, path, key equivalent), in order. */
function distinctEntries(entries) {
  const seen = new Set()
  return entries.filter((entry) => {
    const key = JSON.stringify([entry.name, entry.path, entry.keyEquivalent])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * CU-236: one menuKey reply as the driver passes it on, failing closed. The helper answers every item whose key
 * equivalent matches (a disabled benign first match must not hide a consequential one), so the answer is a list:
 * `{ items: [{ role: 'AXMenuItem', name, keyEquivalent, path, enabled, appleMenu? }] }` with 1 to MAX_BOUND_ITEMS
 * distinct entries, and `{ none: true }` only for that exact answer - each only when the reply names an app in `scope`; `{ unreadable: true }` for everything else - the
 * helper's own unreadable (its `reason` is not passed on), `truncated` or `incomplete`, an empty or over-long list, any malformed or untitled entry, a bundle id outside
 * `scope` (the reply's or an entry's), a malformed reply. Never a value: only titles, the path of titles, the key
 * equivalent (CU-154's integer modifier mask), whether the item is enabled (context only: disabled items still count),
 * and the helper's mark for the Apple menu.
 */
export function boundMenuItemOf(reply, scope = []) {
  const unreadable = { unreadable: true }
  if (reply === null || typeof reply !== 'object') return unreadable
  // Every answer names the app whose bar was read (helper 0.2.52 always does; cu-researcher, cu-developer-one): a list or
  // a none without a string bundle id in the run's scope is unreadable.
  if (typeof reply.bundleId !== 'string' || !scope.includes(reply.bundleId)) return unreadable
  const flagged = (field) => reply[field] !== undefined && reply[field] !== false
  if (reply.none === true && reply.items === undefined && reply.unreadable === undefined && !flagged('truncated') && !flagged('incomplete')) return { none: true }
  // incomplete (helper 0.2.52): a lazily filled top-level menu showed no items, so a match may be missing - unreadable,
  // like truncated (cu-developer-one's decision); found items are not judged alone.
  if (reply.none !== undefined || reply.unreadable !== undefined || flagged('truncated') || flagged('incomplete')) return unreadable
  if (!Array.isArray(reply.items) || reply.items.length < 1 || reply.items.length > MAX_BOUND_ITEMS) return unreadable
  const entries = reply.items.map((item) => boundEntryOf(item, scope))
  if (entries.some((entry) => entry === null)) return unreadable
  return { items: distinctEntries(entries) }
}

/** Two answers (two keys of one chord) as one: an unreadable read wins; lists join, deduplicated, within the cap. */
function combineBound(a, b) {
  if (a === null) return b
  if (a.unreadable || b.unreadable) return { unreadable: true }
  if (a.none) return b
  if (b.none) return a
  const items = distinctEntries([...a.items, ...b.items])
  return items.length > MAX_BOUND_ITEMS ? { unreadable: true } : { items }
}

/**
 * CU-250 (helper 0.2.53): a menu item's place - the titles from the menu bar down to the item, at most 10, each trimmed
 * and capped at 80 characters ('' for an untitled level). Null when absent (an older helper, not a menu item) or
 * malformed. Context for agent core (Open With > Terminal); never in run records.
 */
export function menuPathOf(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10) return null
  if (!value.every((step) => typeof step === 'string')) return null
  return value.map((step) => step.trim().slice(0, 80))
}

/**
 * CU-250: whether a menu item sits under the Services menu - false when the helper sends nothing, true for its true and
 * for any other value: a malformed mark fails closed, since app-policy refuses a Services item and a refused menu click
 * is the safe side.
 */
export function servicesMenuOf(value) {
  return !(value === undefined || value === null || value === false)
}

/**
 * CU-255: the file an element shows (the helper's `filename`, AXFilename) as launch_code reads it - a bare file name
 * of 1 to 255 characters with no '/' or control character; null otherwise or when absent (an older helper, a non-file
 * element). Finder may hide the extension in the element's title (Payload for Payload.app), never in this.
 */
export function fileNameOf(value) {
  if (typeof value !== 'string') return null
  const name = value.trim()
  return name.length > 0 && name.length <= 255 && !name.includes('/') && !/[\u0000-\u001f\u007f]/.test(name) ? name : null
}

/**
 * CU-255: an element's `url` (AXURL) reduced to what launch_code reads - a file URL's last path component, decoded, a
 * directory or bundle keeping its trailing '/' (Payload.app/); never the path, which names the owner's folders. Null for
 * any other scheme, a malformed URL or a leaf fileNameOf refuses.
 */
/**
 * CU-392 (cu-coordinator 01:21Z): whether an element's AXURL names a network volume or server - its scheme is one of
 * smb, cifs, afp, nfs, webdav, davs or ftp (a server row in a file browser, a share on it). A boolean only: the URL, host
 * and share never leave the driver. A mounted share reads as a file: URL under /Volumes and is not seen here (a named
 * limit), nor is a WebDAV volume addressed by http(s).
 */
export const NETWORK_VOLUME_SCHEMES = Object.freeze(['smb', 'cifs', 'afp', 'nfs', 'webdav', 'davs', 'ftp'])
export function networkVolumeOf(value) {
  if (typeof value !== 'string') return false
  const scheme = /^([a-z][a-z0-9+.-]{0,15}):/i.exec(value.trim())?.[1]?.toLowerCase()
  return scheme !== undefined && NETWORK_VOLUME_SCHEMES.includes(scheme)
}

export function fileUrlLeafOf(value) {
  if (typeof value !== 'string') return null
  let url
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'file:') return null
  const parts = url.pathname.split('/').filter((part) => part !== '')
  if (parts.length === 0) return null
  let leaf
  try {
    leaf = fileNameOf(decodeURIComponent(parts[parts.length - 1]))
  } catch {
    return null
  }
  return leaf === null ? null : leaf + (url.pathname.endsWith('/') ? '/' : '')
}

/** CU-259: the most selected items one answer may carry (design note 0.2 on CU-252). */
export const MAX_SELECTED_ITEMS = 32
const SELECTED_KINDS = new Set(['folder', 'file', 'unknown'])

/**
 * CU-259 (CU-252 rule 3): one selectedItems reply as the driver passes it on, failing closed as menuKey does.
 * `{ items: [{ name, kind }] }` with 1 to MAX_SELECTED_ITEMS entries - a bare file name (fileNameOf) and a kind the helper
 * worked out from the AXURL string alone ('folder' for a trailing '/', 'file', 'unknown' without a file URL; never URL
 * resource values, D-024); `{ none: true }` when the focused collection has nothing selected; `{ notCollection: true }`
 * when the focus is no collection (the focused target, with its filename and URL leaf, is what Command-O acts on); and
 * `{ unreadable: true }` for everything else - the helper's own unreadable, `truncated`, an empty or over-long list, any
 * malformed or unnamed entry, a reply naming no app or one outside `scope`, more than one answer at once. Never a path
 * or the contents.
 */
export function selectedItemsOf(reply, scope = []) {
  const unreadable = { unreadable: true }
  if (reply === null || typeof reply !== 'object') return unreadable
  if (typeof reply.bundleId !== 'string' || !scope.includes(reply.bundleId)) return unreadable
  const answers = ['items', 'none', 'notCollection', 'unreadable'].filter((key) => reply[key] !== undefined)
  if (answers.length !== 1 || (reply.truncated !== undefined && reply.truncated !== false)) return unreadable
  if (reply.none === true) return { none: true }
  if (reply.notCollection === true) return { notCollection: true }
  if (!Array.isArray(reply.items) || reply.items.length < 1 || reply.items.length > MAX_SELECTED_ITEMS) return unreadable
  const items = []
  for (const item of reply.items) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return unreadable
    const name = fileNameOf(item.name)
    if (name === null || !SELECTED_KINDS.has(item.kind)) return unreadable
    items.push({ name, kind: item.kind })
  }
  return { items }
}

/**
 * CU-265: the scheme of a link's URL, what agent core asks about when it is not a web scheme (facetime:, tel:, zoommtg:,
 * mailto: start another app) - lower case, no colon, the scheme only and never the rest of the URL. Null when there is
 * no URL or it does not parse.
 */
export function linkSchemeOf(url) {
  if (typeof url !== 'string' || url.trim() === '') return null
  let parsed
  try {
    parsed = new URL(url.trim())
  } catch {
    return null
  }
  const scheme = parsed.protocol.replace(/:$/, '').toLowerCase()
  return /^[a-z][a-z0-9+.-]{0,31}$/.test(scheme) ? scheme : null
}

/** A helper's panel marker: 'save', 'open' or 'unknown' (any other value fails closed to 'unknown'); null when absent. */
function panelOf(value) {
  if (value === undefined || value === null) return null
  return value === 'save' || value === 'open' ? value : 'unknown'
}

/** The helper's elementOwner as `{pid, bundleId}` for details, or null when it sent none. */
function rawOwner(owner) {
  if (owner === null || typeof owner !== 'object') return null
  return { pid: Number.isInteger(owner.pid) ? owner.pid : null, bundleId: typeof owner.bundleId === 'string' && owner.bundleId.length > 0 ? owner.bundleId : null }
}

/**
 * A process's executable name from its pid (`ps -o comm=`, basename only, at most 64 characters), for a refusal's
 * details; null when it cannot be read within half a second. Best effort: it never delays or changes the refusal.
 */
function executableOf(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return Promise.resolve(null)
  return new Promise((resolve) => {
    execFile('/bin/ps', ['-o', 'comm=', '-p', String(pid)], { timeout: 500 }, (error, stdout) => {
      const line = error ? '' : (String(stdout).trim().split('\n')[0] ?? '').trim()
      resolve(line.length > 0 ? line.split('/').pop().slice(0, 64) : null)
    })
  })
}

/** The bundle id of the process owning an element when the helper says it differs from the window's owner, or null. */
function foreignOwner(element) {
  const owner = element?.elementOwner?.bundleId
  return typeof owner === 'string' && owner.length > 0 && owner !== element.bundleId ? owner : null
}

class DesktopEnvironment {
  #events = new EventEmitter()
  #unsubscribeControl = null
  #releaseRun
  #noteInput
  #exclusions
  /** Scope changes run one at a time, so each sends the union of every approval before it (see `addApp`). */
  #scopeQueue = Promise.resolve()
  /**
   * Whether the first app's join confirmed the frame known since launch (the scope reply's display and the first
   * capture both matched it). The frame exists before this, so it is this flag, not the frame, that says whether
   * anything may be captured, inspected or posted yet.
   */
  #frameConfirmed = false
  /** CU-100: a capture in this run has shown an approved app's window (from then on, blank frames are passed on). */
  #sawAppWindow = false
  #appWindowWaitSpent = false
  /** CU-100: the latest scope reply's `running` and `display` (null before any scope reply). */
  #scopeEvidence = null
  #appWindowWaitMs = 5000
  #appWindowPollMs = 500
  /** Whether the first app's join may still re-fit the frame (CU-68): opted in at launch, until `lockFrame()`. */
  #refitAllowed = false
  /**
   * Whether the next `input` request settles: set when run control enters `running` from a state a person ends
   * (`SETTLE_AFTER`), spent by the first input request formed after that (see "The settle after a human resume").
   */
  #settlePending = false
  /**
   * How many settling input requests are outstanding (one at a time from agent core; a count so overlapping callers
   * cannot end the window early). While any is, a `localInput` event is the person the settle waits out, not a pause.
   */
  #settling = 0
  #leakedFrames = 0
  /** `localInput` events that arrived while a settle was outstanding and so paused nothing; read by checks. */
  #settleLocalInputs = 0

  constructor({
    link, server, candidates = [], mode, control, signal, limits, releaseRun, run, simulateScale = null, simulateDisplay = null, refitFrameAtFirstApp = false, captureDir = null, exclusions = createExclusions(),
    settleMs = SETTLE_MS, noInput = false, menuCloseMs = MENU_CLOSE_MS, appWindowWaitMs = APP_WINDOW_WAIT_MS, appWindowPollMs = APP_WINDOW_POLL_MS,
  }) {
    this.kind = 'desktop'
    this.site = SITE
    this.link = link
    this.server = server
    // The caller's start apps, for agent core to ask about; never sent by this driver (P11).
    this.candidates = Object.freeze([...candidates])
    // The apps this run asked the helper to scope, each through `addApp` after an approval; the helper's answer is `scope`.
    this.apps = Object.freeze([])
    this.mode = mode
    this.control = control ?? null
    this.signal = signal ?? null
    this.limits = limits
    this.#releaseRun = releaseRun ?? (() => {})
    this.#noteInput = typeof releaseRun?.noteInput === 'function' ? releaseRun.noteInput : () => {}
    this.#exclusions = exclusions
    this.run = Object.freeze({ seat: run?.seat ?? null, runId: run?.runId ?? null })
    this.simulateScale = simulateScale
    this.simulateDisplay = simulateDisplay
    this.#refitAllowed = refitFrameAtFirstApp === true
    this.settleMs = settleMs
    this.noInput = noInput
    this.menuCloseMs = menuCloseMs
    this.#appWindowWaitMs = appWindowWaitMs
    this.#appWindowPollMs = appWindowPollMs
    this.captureDir = captureDir
    this.hello = link.hello
    this.grants = grantsOf(link.hello)
    // CU-64 G1 (helper 0.2.30): keys or buttons a helper that died mid-hold left down, released by this helper at its
    // start; the run records it and the person's notice says so. Null when nothing was left. The link keeps the event
    // (it can come before this environment exists); a later one updates it.
    this.releasedStale = releasedStaleOf(link.releasedStale)
    // A releasedStale that comes after the environment exists is also emitted. One that came during the launch (the
    // usual case: the helper sends it with the driver's first request) is in state().releasedStale for the run to read.
    link.on('releasedStale', (payload) => {
      this.releasedStale = releasedStaleOf(payload)
      if (this.releasedStale !== null) this.#events.emit('releasedStale', this.releasedStale)
    })
    // What this driver performs, read by agent core (CU-64): 'press_hold' says a drag point may carry holdMs (a long
    // press, held inside the one input request), so agent core sends a wait inside a press instead of refusing it.
    this.actionTypes = Object.freeze([...ACTION_TYPES, 'press_hold'])
    this.secureInput = false
    // CU-76: a system prompt can take keys (helper 0.2.28's capture flag: a prompt process in front, or a system dialog as
    // the front approved app's focused window or sheet) - from the helper's capture replies (and a hit
    // element that belongs to one); only a capture reply clears it, never a resume, so no key slips to a prompt still up.
    this.systemPrompt = false
    this.scope = Object.freeze([])
    // Set by `start()` from the hello, before `launchDesktopEnvironment` resolves; fixed for the run from then on.
    this.frame = undefined
    this.pointer = null
    this.frontmostBundleId = null
    this.title = ''
    this.pauseArmed = false
    this.localInputAt = null
    this.lostReason = link.lost ? link.lostReason : null
    this.closed = false
    this.closing = false
    this.lastShot = null
    this.screencast = null
    this.noAppWindow = false
    link.on('lost', ({ reason }) => this.#onLost(reason))
    link.on('localInput', (payload) => this.#onLocalInput(payload))
    link.on('frame', (payload) => this.#onFrame(payload))
    // A local-input stop clears only when a person brings the run back to running (resume or hand back). So does the
    // secure-input mark: the hand-off it caused is over, and the next key step is checked by the helper afresh.
    // Any return to running from a person's state - an answered consent too - makes the next input settle.
    this.#unsubscribeControl = this.control?.subscribe?.((event) => {
      if (event?.type !== 'state' || event.state !== 'running') return
      if (event.prior === 'paused' || event.prior === 'taken_over') {
        this.localInputAt = null
        this.secureInput = false
        // CU-64 D5: the person may have moved the pointer meanwhile, so the last point sent is no longer where it is.
        this.pointer = null
      }
      if (SETTLE_AFTER.includes(event.prior)) this.#settlePending = true
    }) ?? null
  }

  /**
   * The launch's own steps, with the scope empty (P11): the Screen Recording grant as the hello reports it, the frame
   * from the hello's displays, then the local-input pause. Nothing is scoped or captured; the first `addApp` does both.
   */
  async start() {
    // Without the grant no frame can ever exist; stopping now spares a person questions about apps for a run that
    // cannot see them. An unknown grant (null) is left to the first capture to tell.
    if (this.grants.screen === false) throw notGranted('screen')
    this.frame = this.#launchFrame()
    const armed = await this.link.request('pauseOnLocalInput', { on: true })
    this.pauseArmed = armed.armed === true
    if (!this.pauseArmed && this.mode === 'global') {
      throw new EnvironmentError('blocked_by_policy', 'the local-input pause could not be armed, and global input never runs without it (D-024)', { reason: 'pause_not_armed' })
    }
  }

  /**
   * Put one more app in the helper's scope, after a person approved it (app-policy.md 0.3.4, P11: the run scope
   * starts empty and grows only on an approval through a human channel, start apps included; the frame shows the app
   * from the next capture). Resolves with the new scope; captures, hit tests and input may target the app from then on.
   *
   * The helper's `scope` request replaces its scope, so the union of the run's approved apps and the new one is sent.
   * An excluded app is refused by name (`blocked_by_policy`, reason `excluded`) before anything is sent, and the scope
   * stays as it was; the helper refuses one this driver's table misses the same way, also leaving its scope unchanged.
   * An app already in scope resolves at once, sending nothing. Calls run one after another, so two approvals in quick
   * succession cannot each send a union that lacks the other. This member grants nothing by itself: only agent core's
   * consent gate, after a human answer, may call it (C3).
   *
   * The first app that joins also confirms the run's frame, known since launch (capture-and-scaling.md: one display per
   * run, the frame fixed for it). The display the helper names for the scope must be the one the frame was fitted to,
   * and the first capture of it must have the frame's geometry and size; otherwise `addApp` refuses `display_changed`
   * and nothing is remapped - `frame`, which agent core may already have recorded, stays as it is. The scope this
   * driver reports changes only once that capture has succeeded and matched, so a scope is never in effect without a
   * confirmed frame to map it: if either step fails, `addApp` rejects, the scope stays empty here and a later `addApp`
   * tries again (the helper keeps the app, which a person approved).
   */
  addApp(bundleId) {
    const change = this.#scopeQueue.then(() => this.#addApp(bundleId))
    this.#scopeQueue = change.catch(() => {})
    return change
  }

  async #addApp(bundleId) {
    this.#assertUsable()
    if (typeof bundleId !== 'string' || !BUNDLE_ID.test(bundleId)) throw invalid(`'${String(bundleId)}' is not a bundle id`)
    const refusal = excludedRefusal(this.#exclusions, bundleId)
    if (refusal !== null) throw refusal
    if (this.scope.includes(bundleId)) return [...this.scope]
    const wanted = this.apps.includes(bundleId) ? [...this.apps] : [...this.apps, bundleId]
    if (wanted.length > MAX_APPS) throw invalid(`a run's scope holds at most ${MAX_APPS} apps`)
    const reply = await this.link.request('scope', { bundleIds: wanted })
    if (!Array.isArray(reply.bundleIds)) {
      throw this.#protocolFailure(new EnvironmentError('helper_lost', 'the helper answered scope without its bundle ids', { refused: 'the scope reply has no bundleIds' }))
    }
    // The helper's scope is now what it answered; this driver never assumes more than that.
    const scope = Object.freeze(reply.bundleIds.filter((id) => wanted.includes(id)))
    // CU-100: what this reply says about the approved apps' windows - the driver's own evidence for an older helper's
    // empty-filter refusal (running: the scope's running apps; display: a running approved app's focused window's).
    this.#scopeEvidence = { running: Array.isArray(reply.running) ? reply.running : null, display: reply.display ?? null }
    const refused = () => new EnvironmentError('out_of_scope', `the helper did not put ${bundleId} in scope`, { bundleId })
    if (!this.#frameConfirmed) {
      if (!scope.includes(bundleId)) throw refused()
      await this.#confirmFrame(bundleId, reply.display, scope)
    }
    this.scope = scope
    if (!this.scope.includes(bundleId)) throw refused()
    this.apps = Object.freeze(wanted)
    // A live viewer that registered before any app was approved starts watching now; its failure is not the approval's.
    if (this.screencast !== null && !this.screencast.watching) await this.#watch(this.screencast).catch(() => {})
    return [...this.scope]
  }

  /**
   * The run's frame from the hello alone, with nothing captured: agent core writes it into run.json's header before any
   * start app is admitted. The display is the main one - the helper's own choice for a capture that names none - else
   * the first; the design's display (the one holding the target app's key window) is only known at the first `addApp`,
   * which may re-fit the frame to it if it is another listed display and the caller opted in (CU-68). Under the simulateScale seam the helper renders as if the display had that backing
   * scale, so the fit uses it. A helper that reports no display could never capture anything, so the launch stops.
   */
  #launchFrame() {
    const displays = this.hello.displays ?? []
    const display = displays.find((d) => d.main === true) ?? displays[0]
    if (display === undefined) throw new EnvironmentError('resource_refused', 'the helper reported no display, so this run could never see anything', { reason: 'no_display' })
    const region = this.simulateDisplay
    if (region !== null && (region.width > display.sizePt.width || region.height > display.sizePt.height)) {
      throw invalid(`simulateDisplay ${region.width}x${region.height} does not fit display ${String(display.id)} (${display.sizePt.width}x${display.sizePt.height} points)`, { field: 'simulateDisplay' })
    }
    // Under the simulateDisplay seam the run's display is that region from the display's top-left (CU-70).
    const shown = region === null ? display : { ...display, sizePt: { width: region.width, height: region.height } }
    return displayFrame(shown, this.limits, this.simulateScale ?? display.scale)
  }

  /**
   * From now on the frame is fixed (CU-68): the first app's join may no longer re-fit it, so another display ends the run
   * `display_changed`. A caller that opted in calls this once its start apps have joined, before a model session opens
   * with the frame's size; returns the frame, the one to record. Harmless when not opted in or already fixed.
   */
  lockFrame() {
    this.#refitAllowed = false
    return this.frame
  }

  /**
   * The first app's join may fix the run's display (CU-68). Under `refitFrameAtFirstApp`, until `lockFrame()`, the frame
   * is the launch's guess - the main display - so when the scope reply names another display the hello listed (the one
   * holding the app's focused window), the frame is re-fitted to that display, once; the caller reads `frame` after the
   * join and records it. Otherwise - not opted in, already fixed (a model session may hold the launch frame's size), a
   * display the hello never listed, or any other display under the simulateDisplay seam (its region is the main
   * display's) - another display stays `display_changed`. Then the first capture, at the frame's size, must match the frame exactly - the check every
   * later full screenshot makes too, so the frame never changes after this. Every refusal leaves the scope unset.
   */
  async #confirmFrame(bundleId, named, scope) {
    let { frame } = this
    if (named !== undefined && named !== null && named !== frame.display) {
      const display = (this.hello.displays ?? []).find((d) => d.id === named)
      if (display === undefined || this.simulateDisplay !== null || !this.#refitAllowed) {
        const why = display === undefined ? 'a display the helper never reported'
          : this.simulateDisplay !== null ? 'not the display the simulateDisplay region is on'
            : `not on the ${frame.width}x${frame.height} frame of display ${String(frame.display)} this run is fixed to`
        const message = `the helper put ${bundleId} on display ${String(named)}, ${why}; the run ends rather than remap`
        throw new EnvironmentError('display_changed', message, { bundleId, display: named, frameDisplay: frame.display })
      }
      frame = displayFrame(display, this.limits, this.simulateScale ?? display.scale)
    }
    const fixed = `the ${frame.width}x${frame.height} frame of display ${String(frame.display)} this run is fixed to`
    // The helper already answered this scope; the driver adopts it only once the frame is confirmed, so the leak check
    // judges this capture against the scope the helper is using.
    const shot = await this.#captureForFrame({ display: frame.display, maxSize: { width: frame.width, height: frame.height }, ...this.#frameRegion() }, scope)
    if (!captureMatchesFrame(shot, frame)) {
      const message = `the first capture does not match ${fixed}; the run ends rather than remap`
      throw new EnvironmentError('display_changed', message, { bundleId, display: shot.display ?? null, frameDisplay: frame.display })
    }
    this.frame = frame // adopted only once a capture has confirmed it
    this.lastShot = shot
    this.#frameConfirmed = true
  }

  /**
   * A full capture's `region` under the simulateDisplay seam: the frame's own points, so the helper captures exactly
   * the region the run takes as its display; without the seam, nothing (the whole display).
   */
  #frameRegion() {
    if (this.simulateDisplay === null) return {}
    const { originPt, sizePt } = this.frame
    return { region: { x: originPt.x, y: originPt.y, width: sizePt.width, height: sizePt.height } }
  }

  /** End the link for a reply that breaks the protocol, and return the error to throw: the run cannot go on. */
  #protocolFailure(error) {
    this.link.lose(`protocol: ${error.details?.refused ?? error.message}`)
    return error
  }

  /**
   * One `capture`, checked: the image comes inline or as a verified file in the run directory (`captureImage`), it
   * must be a PNG of the size the helper reported, and under the simulateScale seam it must be at that scale - a
   * helper that ignored the seam would make a mapping check pass without proving anything.
   */
  async #capture(fields, scope = this.scope) {
    const reply = await this.link.request('capture', this.simulateScale !== null ? { ...fields, simulateScale: this.simulateScale } : fields)
    let data
    let size
    try {
      data = captureImage(reply, { runDir: this.captureDir })
      size = pngSize(data)
    } catch (error) {
      throw this.#protocolFailure(error instanceof EnvironmentError && error.code === 'helper_lost' ? error : new EnvironmentError('helper_lost', 'the helper returned a capture that is not a PNG', { refused: 'the capture is not a PNG' }))
    }
    if (size.width !== reply.widthPx || size.height !== reply.heightPx) {
      throw this.#protocolFailure(new EnvironmentError('helper_lost', 'the helper reported a capture size its image does not have', { refused: 'the capture size does not match its image' }))
    }
    if (this.simulateScale !== null && !same(reply.scale, this.simulateScale)) {
      throw this.#protocolFailure(new EnvironmentError('helper_lost', 'the helper did not capture at the simulated scale', { refused: 'the capture ignored simulateScale' }))
    }
    // Defense in depth against a helper whose capture filter lets an out-of-scope app through (step 5, helper 0.2.10:
    // a later capture matched windows by executable name, so CU Ledger showed beside CU Fixture; D-035). The reply's
    // `windows` are the windows the capture included, each named by its owner's bundle id; any window whose owner is
    // outside the run's scope - or has no owner to attribute - drops the frame before it can reach the model.
    // It complements the helper's fix, never replaces it: it holds only while the helper reports what it included.
    const leaked = (Array.isArray(reply.windows) ? reply.windows : []).find((w) => typeof w?.bundleId !== 'string' || !scope.includes(w.bundleId))
    if (leaked !== undefined) {
      throw new EnvironmentError('out_of_scope', 'the capture included a window of an app outside the run\'s scope, so the frame was dropped', {
        reason: 'capture_leak', bundleId: typeof leaked?.bundleId === 'string' ? leaked.bundleId : null,
      })
    }
    if (typeof reply.frontmostBundleId === 'string' || reply.frontmostBundleId === null) this.frontmostBundleId = reply.frontmostBundleId
    // CU-76: the helper says on every capture whether a system prompt can take keys; an older helper says nothing (unchanged).
    if (typeof reply.systemPrompt === 'boolean') this.systemPrompt = reply.systemPrompt
    // CU-100: whether the latest capture found no window of an approved app (helper 0.2.32), for the live view's notice.
    this.noAppWindow = reply.noAppWindow === true
    const front = (reply.windows ?? []).find((w) => w?.bundleId === this.frontmostBundleId && typeof w.title === 'string')
    this.title = front?.title ?? ''
    return {
      data, mimeType: 'image/png', width: size.width, height: size.height, display: reply.display, originPt: reply.originPt,
      sizePt: reply.sizePt, scale: reply.scale, frontmostBundleId: this.frontmostBundleId, windows: reply.windows ?? [],
      noAppWindow: reply.noAppWindow === true,
    }
  }

  /**
   * CU-100 (CU-98, design no-app-window.md): a capture that says no window of an approved app is on screen. Until a
   * capture in this run has shown a window, it is re-taken every `appWindowPollMs` for up to `appWindowWaitMs` (5 s:
   * an app the run just launched may not have its window yet), then the run ends `no_app_window`, naming the apps and
   * the likely causes - never helper_lost, since the helper is fine. Once a window has been seen, a blank frame is
   * passed on marked `noAppWindow`, and agent core's time bound decides (one counter, agent core's).
   *
   * The wait runs once per run: once it has expired, a later capture that still finds no window fails at once. Agent
   * core takes a final screenshot when a run ends without one, and that capture waited the 5 s again - the closed
   * case ended in 10.85 s instead of about 5 (cu-verifier's live pair on helper 0.2.32).
   */
  async #captureAwaitingWindow(fields, scope = this.scope) {
    let shot
    try {
      shot = await this.#capture(fields, scope)
    } catch (error) {
      throw this.#olderHelperNoWindow(error, scope) ?? error
    }
    if (!shot.noAppWindow || this.#sawAppWindow) {
      if (!shot.noAppWindow) this.#sawAppWindow = true
      return shot
    }
    if (this.#appWindowWaitSpent) throw noAppWindowError(scope)
    const deadline = Date.now() + this.#appWindowWaitMs
    while (shot.noAppWindow && Date.now() < deadline) {
      await new Promise((done) => setTimeout(done, this.#appWindowPollMs))
      shot = await this.#capture(fields, scope)
    }
    if (shot.noAppWindow) {
      this.#appWindowWaitSpent = true
      throw noAppWindowError(scope)
    }
    this.#sawAppWindow = true
    return shot
  }

  /**
   * The capture that confirms the run's frame when the first app joins (`addApp`). A blank frame from helper 0.2.32
   * still has the asked size and display, so it confirms the geometry; the no-window stop belongs to the first
   * screenshot, whose error ends the run. Agent core logs a refused start app and goes on, so a stop thrown here
   * reached the caller as 'no app is in this run's scope yet' (the CU-100 end-to-end test through the MCP server).
   * An older helper's refusal is still mapped here, when the scope reply's evidence says no window.
   */
  async #captureForFrame(fields, scope) {
    let shot
    try {
      shot = await this.#capture(fields, scope)
    } catch (error) {
      throw this.#olderHelperNoWindow(error, scope) ?? error
    }
    if (!shot.noAppWindow) this.#sawAppWindow = true
    return shot
  }

  /**
   * An older helper (before 0.2.32) cannot capture an empty window filter and fails the capture with 'the capture
   * returned no image' - words other capture failures may share. So it is no_app_window only when BOTH hold
   * (cu-verifier): that exact refusal at the run's first capture (no window seen yet), and the driver's own evidence
   * from the scope reply just before it - no approved app running, or none with a focused window while the helper has
   * the Accessibility grant that makes `display` meaningful. Anything else stays what it was.
   */
  #olderHelperNoWindow(error, scope) {
    if (this.#sawAppWindow || error?.code !== 'helper_lost' || !String(error.message).includes(OLDER_HELPER_NO_IMAGE)) return null
    const evidence = this.#scopeEvidence
    const noneRunning = Array.isArray(evidence?.running) && evidence.running.length === 0
    const noneFocused = evidence !== null && evidence.display === null && this.hello?.grants?.accessibility === true
    return noneRunning || noneFocused ? noAppWindowError(scope) : null
  }

  #assertUsable() {
    if (this.closed) throw new EnvironmentError('closed', 'the environment is closed')
    if (this.lostReason !== null) throw new EnvironmentError('helper_lost', `the desktop helper is gone: ${this.lostReason}`)
  }

  /**
   * Usable, and at least one approved app in scope - which, by `addApp`, means the frame is confirmed too. Before that
   * nothing may be captured, inspected or posted (P11), so the member is refused by name without a request: the code
   * and reason are the ones the helper's own `no_scope` refusal maps to, so a caller sees one answer for one state.
   * The frame known since launch does not count: no capture has shown it is the run's.
   */
  #assertInScope() {
    this.#assertUsable()
    if (this.scope.length === 0 || !this.#frameConfirmed) throw noScopeRefusal()
  }

  /**
   * How this run maps a frame point to global points (capture-and-scaling.md, C7): per-axis frame pixels per point
   * and the frame's origin, exactly what `toGlobal` reads, plus the display. A fresh plain object, safe to record.
   */
  #mapping() {
    const { scaleX, scaleY, originPt, display } = this.frame
    return { frameScaleX: scaleX, frameScaleY: scaleY, originPt: { x: originPt.x, y: originPt.y }, display }
  }

  /** The run-control gate and the signal, as in the browser executor; plus the local-input stop. */
  #checkGates() {
    if (this.signal?.aborted) throw new EnvironmentError('cancelled', 'the run was cancelled')
    if (this.control !== null && this.control.agentMayAct?.() !== true) {
      if (this.control.state === 'finished') throw new EnvironmentError('cancelled', 'the run was stopped')
      throw new EnvironmentError('taken_over', `the run is ${this.control.state ?? 'not running'}; the agent sends no input`)
    }
    if (this.localInputAt !== null) throw new EnvironmentError('taken_over', 'the person is using the Mac; the agent sends no input until they resume the run', { reason: 'local_input' })
  }

  #url() {
    return `app:${this.frontmostBundleId ?? ''}`
  }

  #effect(extra = {}) {
    return { navigated: false, url: this.#url(), blocked: [], popup: null, dialog: null, frontmostBundleId: this.frontmostBundleId, ...extra }
  }

  on(event, listener) {
    this.#events.on(event, listener)
    return () => this.#events.off(event, listener)
  }

  /**
   * How many `localInput` events arrived while a settling input request was outstanding - each the person the settle
   * waited out, so none paused the run or reached listeners (see "The settle after a human resume"). For checks: a
   * test hook, not run state, so it is not in `state()`.
   */
  get settleLocalInputs() {
    return this.#settleLocalInputs
  }

  #onLost(reason) {
    if (this.lostReason !== null) return
    this.lostReason = reason
    // The helper exits after `bye`; that end is the close this driver asked for, not a crash.
    if (this.closing) return
    this.#events.emit('crash', { code: 'helper_lost', reason })
    this.#events.emit('helper_lost', { reason })
  }

  /**
   * The person touched the Mac: stop sending input at once, ask run control to pause (sender `local_input`, which may
   * only pause, C4), and tell listeners the time and kind only - never which key or where (trajectory-privacy.md).
   * Until agent core accepts that sender (C4, M8) the pause is refused there, and this driver's own stop still holds:
   * every action fails `taken_over` until a person resumes or hands back.
   *
   * Not while a settling input request is outstanding: the helper's guards stay armed through the settle and report
   * the very person - the Resume click's drift through Screen Sharing - the settle waits out, so pausing on it would
   * bring back the resume loop the settle exists to end. Such an event is only counted; the helper's own answer
   * decides (past the cap, `local_input` at step 0 pauses through `#localInputAnswer`).
   */
  #onLocalInput(payload) {
    if (this.#settling > 0) {
      this.#settleLocalInputs += 1
      return
    }
    const kind = payload?.kind === 'key' ? 'key' : 'pointer'
    const at = typeof payload?.at === 'string' ? payload.at : new Date().toISOString()
    this.#stopForLocalInput(at, kind)
  }

  /**
   * A `local_input` answer to an input request whose stop no `localInput` event set - the helper's settle ran past its
   * cap (design 0.4.1), the events of the wait having paused nothing (`#onLocalInput`) - is stopped as any local input
   * is, so agent core pauses the run through C4 as it would for the event. The kind is null: the answer does not say
   * whether it was a key or the pointer. An answer an event came before finds the stop already set, changing nothing.
   */
  #localInputAnswer(error) {
    if (error?.details?.reason !== 'local_input' || this.localInputAt !== null) return
    this.#stopForLocalInput(new Date().toISOString(), null)
  }

  /** The stop, the pause request and the listeners' report of one local input, at `at`, of `kind` (or null). */
  #stopForLocalInput(at, kind) {
    // The stop is the driver's half of a pause and matters only while the agent may act. Waiting for consent, paused
    // or taken over, the agent is idle and the person's input is expected - answering consent in the live view on
    // this very Mac is local input - and run control returns to running through a person (or the loop after their
    // answer), never by itself. A stop set then would outlive the wait and refuse every later action with no pause
    // to resume (found by the M8 live-view work). The next local input while running pauses as usual.
    const state = this.control?.state
    if (state === undefined || state === 'running') this.localInputAt = at
    try {
      this.control?.send?.({ command: 'pause', reason: 'local input on the Mac' }, { source: 'local_input' })
    } catch {
      // A control that throws never keeps the stop from holding.
    }
    this.#events.emit('localInput', { at, kind })
  }

  /** Watch frames dropped because they named a window outside the scope (tests and diagnostics read it). */
  get leakedFrames() {
    return this.#leakedFrames
  }

  /**
   * A watch frame for the live view. From helper 0.2.15 it names the windows it shows, as a capture reply does; then
   * the same capture_leak rule applies - a frame naming a window whose owner is outside the scope, or unowned, never
   * reaches the viewer (D-035 defense in depth, extended to the person's view; CU-12). A frame from an older helper
   * names none and passes as before, its helper's own filter being the guard.
   */
  #onFrame(payload) {
    // CU-100: a watch frame that says whether an approved window is on screen keeps the live view's notice current.
    if (typeof payload?.noAppWindow === 'boolean') this.noAppWindow = payload.noAppWindow
    if (this.screencast === null || typeof payload?.png !== 'string') return
    if (Array.isArray(payload.windows) && payload.windows.some((w) => typeof w?.bundleId !== 'string' || !this.scope.includes(w.bundleId))) {
      this.#leakedFrames += 1
      return
    }
    try {
      this.screencast.onFrame({
        data: Buffer.from(payload.png, 'base64'), mimeType: 'image/png', takenAt: payload.at ?? null,
        metadata: { deviceWidth: this.frame.viewport.width, deviceHeight: this.frame.viewport.height },
      })
    } catch {
      // A viewer that throws never stops the stream.
    }
  }

  /**
   * PNG of the approved apps on the run's display at the frame's size, or a `region` `[x0, y0, x1, y1]` (frame pixels)
   * at up to the display's own resolution within the image limits (`zoom`). A full capture whose display, geometry or
   * size differs from the frame ends the run `display_changed`; nothing is remapped.
   */
  async screenshot({ region } = {}) {
    this.#assertInScope()
    if (region !== undefined) {
      const regionPt = regionToGlobal(region, this.frame)
      const factor = fitFactor(regionPt, this.frame.devicePixelRatio, this.limits)
      const shot = await this.#capture({ display: this.frame.display, maxSize: sizeAt(regionPt, factor), region: regionPt })
      return this.#shot(shot)
    }
    const shot = await this.#captureAwaitingWindow({ display: this.frame.display, maxSize: { width: this.frame.width, height: this.frame.height }, ...this.#frameRegion() })
    if (!captureMatchesFrame(shot, this.frame)) throw new EnvironmentError('display_changed', 'the display or its mode changed since the first screenshot; the run ends rather than remap')
    this.lastShot = shot
    return this.#shot(shot)
  }

  #shot(shot) {
    return {
      data: shot.data, mimeType: 'image/png', width: shot.width, height: shot.height, url: this.#url(), title: this.title,
      takenAt: new Date().toISOString(), frontmostBundleId: shot.frontmostBundleId, ...(shot.noAppWindow ? { noAppWindow: true } : {}),
    }
  }

  /** The app the helper should bring forward when no approved app is frontmost: the frontmost one if approved, else the first. */
  #inputTarget() {
    return this.scope.includes(this.frontmostBundleId) ? this.frontmostBundleId : this.scope[0]
  }

  /**
   * One validated canonical action in frame pixels; resolves to its `ActionEffect`. Planning re-validates and refuses
   * by name; `wait`, `screenshot`, `zoom` and `cursor_position` post nothing; every other action is one helper `input`
   * request, refused before any event when a grant, the scope or the pause is missing. With no app in scope yet every
   * action is refused (`out_of_scope`, `no_scope`): there is no frame its points could mean anything in. A pointer
   * action is hit-tested at the points it acts at before its input request, and refused `out_of_scope`
   * (`target_out_of_scope` or `target_unverified`) with nothing posted unless each is over an approved app or empty
   * space (`#assertTargetsInScope`, D-036); a planning refusal sends no hit test either. A pointer action's effect
   * carries the `mapping` its points went through (C7). The first input request after a person returned the run to
   * running carries `settleMs` (see "The settle after a human resume").
   */
  async perform(action) {
    this.#assertUsable()
    this.#checkGates()
    this.#assertInScope()
    const plan = planAction(action, this.frame, { mode: this.mode })
    if (plan.local !== null) {
      switch (plan.local.kind) {
        case 'sleep':
          await abortable(plan.local.ms, this.signal)
          return this.#effect()
        case 'zoom': return this.#effect({ zoom: { region: plan.local.region } })
        case 'cursor_position': return this.#effect(await this.#cursor())
        default: return this.#effect()
      }
    }
    // After every gate and planning refusal (which send nothing at all), before the input and the settle flag: a
    // refused target forms no input request, so a pending settle stays for the next one. The gates are checked again
    // after it, because the hit test awaits the helper and a person may have taken over meanwhile.
    // D-066: a run that declared noInput skipped the owner-idle check on that promise, so it posts nothing at all.
    if (this.noInput && plan.input.length > 0) {
      throw new EnvironmentError('resource_refused', 'this run declared it posts no input (noInput, D-066), so it cannot click, type or scroll; nothing was posted', { reason: 'no_input_run' })
    }
    if (this.systemPrompt && plan.input.some((event) => KEY_STEPS.has(event.kind))) throw systemPromptRefusal(null)
    const hit = await this.#assertTargetsInScope(hitTestPoints(plan.input))
    this.#checkGates()
    // Spent here, on the request it rides, whatever becomes of that request (see "The settle after a human resume").
    const settle = this.#settlePending
    this.#settlePending = false
    const fields = { events: plan.input, mode: this.mode, bundleId: this.#inputTarget(), ...(settle ? { settleMs: this.settleMs } : {}) }
    // CU-64: a request that holds keys or the button lasts its holds longer, so its deadline does too - a 10 s hold must
    // never trip the link's timeout, which would end the run.
    const holding = plan.input.reduce((sum, event) => sum + (event.kind === 'hold' ? event.ms : 0), 0)
    const deadline = settle || holding > 0 ? { timeoutMs: (settle ? this.#settleTimeoutMs() : this.#requestTimeoutMs()) + holding } : undefined
    let reply
    // The settle window spans exactly the request: the helper writes its reply after every event of the wait.
    if (settle) this.#settling += 1
    try {
      reply = await this.link.request('input', fields, deadline)
    } catch (error) {
      this.#noteRefusal(error)
      // CU-64 G1: the link died mid-request, so anything the request pressed may still be down - a hold, but also a
      // drag's button, held for seconds without one (cu-verifier). The driver cannot post a key-up itself (only the
      // helper can; its next start releases what its marker names), so it says what may be down.
      const pressed = mayBeHeld(plan.input)
      if ((pressed.keys.length > 0 || pressed.buttons.length > 0) && error instanceof EnvironmentError && error.code === 'helper_lost') {
        error.details = { ...(error.details ?? {}), heldAtLoss: pressed }
      }
      throw error
    } finally {
      if (settle) this.#settling -= 1
      // CU-204: noted whether the request finished or stopped part-way - either may have posted events.
      this.#noteInput()
    }
    if (typeof reply.frontmostBundleId === 'string') this.frontmostBundleId = reply.frontmostBundleId
    if (reply.done !== true) {
      const error = replyError('input', { code: reply.code, message: reply.message, failedAt: reply.failedAt, bundleId: reply.bundleId, point: reply.point, heldKeys: reply.heldKeys })
        ?? new EnvironmentError('helper_lost', 'the helper could not finish the input')
      // Helper 0.2.19 (CU-44): a stop during a held move sent Escape before the release, so nothing dropped - say so;
      // helper 0.2.20 (CU-45) also names where the button came up (global points, as a target refusal's point).
      error.details = { ...(error.details ?? {}), failedAt: reply.failedAt ?? null, partial: (reply.failedAt ?? 0) > 0, ...(reply.cancelledDrag === true ? { cancelledDrag: true } : {}), ...releasedAt(reply, plan.input) }
      // The person's, secure-input and covered-point stops carry this driver's own texts, which would drop the helper's
      // warning that a held button came up after the stop (CU-45); the model reads the message, so it keeps that truth.
      if (error.details.releasedAt !== undefined && ['taken_over', 'secure_input', 'system_prompt', 'out_of_scope'].includes(error.code) && !/released at/.test(error.message)) {
        error.message = `${error.message}; ${RELEASE_NOTE}`
      }
      this.#noteRefusal(error)
      throw error
    }
    // The helper checked secure input was off before each key step it posted, so it is off now.
    if (plan.input.some((event) => KEY_STEPS.has(event.kind))) this.secureInput = false
    // A settled input names the settle it asked for on its effect, so the trajectory shows it on a live run too: the
    // field otherwise travels only on the helper's socket (CU-12's probe could observe it only on the fake helper).
    // It records the request; whether the helper waited depends on local input it saw (helper-protocol-details.md).
    const settled = settle ? { settleMs: this.settleMs } : {}
    // CU-201: a click that chose a menu item resolves only once the menu has closed, so the batch's next action meets
    // the window behind it rather than a menu still tracking the pointer.
    if (hit.menuItem && plan.input.some((event) => event.kind === 'up')) await abortable(this.menuCloseMs, this.signal)
    if (plan.pointer !== null) {
      this.pointer = plan.pointer
      // Only actions that carry a frame point have a pointer; the mapping is the one `planAction` just used.
      return this.#effect({ mapping: this.#mapping(), ...settled })
    }
    return this.#effect(settled)
  }

  /**
   * The driver's own target check (D-036, defense in depth): each global point a pointer action acts at
   * (`hitTestPoints`: the click, move or scroll point, a drag's start and end) is hit-tested, one `hitTest` request
   * each, and the action is refused with nothing posted unless every one is over an approved app or empty space. Live
   * on helper 0.2.10, a click on an out-of-scope app's window (same executable name as the approved app) passed agent
   * core's policy and was delivered by the helper although its hit test named the other app; this check reads that
   * very answer, so neither of those two failing again is enough to post.
   *
   * - An element whose `bundleId` is not in `scope`, or a hit test the helper refuses `out_of_scope`, is
   *   `out_of_scope` with `details.reason: 'target_out_of_scope'`, naming the app.
   * - `null` (empty space, no element) passes: no app is there to act on, and the helper's per-event check still
   *   judges every posted point.
   * - Nothing verified is `out_of_scope`, `details.reason: 'target_unverified'`: an element that names no app (its
   *   process has no bundle id, so it cannot be an approved app), a malformed reply, or a hit test refused for any
   *   other reason (an AX timeout, an argument the helper refuses). The check never fails open.
   * - Refusals that already mean nothing may be posted, and say why more exactly, pass through unchanged: a missing
   *   grant (`not_granted`, as the input itself would answer), an empty helper scope (`no_scope`), a closed or lost
   *   link (`closed`, `helper_lost`; a helper `failed` or a request timeout ends the link) and a cancelled run.
   */
  async #assertTargetsInScope(points) {
    let menuItem = false
    for (const point of points) {
      let reply
      try {
        reply = await this.link.request('hitTest', { xPt: point.x, yPt: point.y })
      } catch (error) {
        throw this.#hitTestRefusal(error, point)
      }
      const { element } = reply
      if (element === null) continue
      if (element === undefined || typeof element !== 'object' || Array.isArray(element)) {
        throw targetUnverified(point, 'the helper\'s hit test returned no element shape')
      }
      // CU-76, first: a prompt's element is the person's whichever process the helper attributes it to.
      if (element.systemPrompt === true) {
        this.systemPrompt = true
        throw systemPromptRefusal(point)
      }
      if (typeof element.bundleId !== 'string' || element.bundleId.length === 0) {
        // Name the process so a recurrence says which one it was. Helper 0.2.24's owner-only reply puts the unapproved
        // side (a bundle-less window over the point, or its element) in the top-level pid; elementOwner always names the
        // element's process, which for a transient window is the approved app - so both are kept, and the culprit's
        // executable name (a process name, never a title) is read from its pid.
        const ownerPid = Number.isInteger(element.pid) ? element.pid : null
        throw targetUnverified(point, 'the element there belongs to no app with a bundle id, so it is not an approved app', {
          ownerPid, ownerExecutable: await executableOf(ownerPid), elementOwner: rawOwner(element.elementOwner),
        })
      }
      if (!this.scope.includes(element.bundleId)) throw targetOutOfScope(element.bundleId, point)
      // D-045, fail closed behind the helper: the element there belongs to another process than its window's owner
      // and that process is not approved - refused, naming it - unless the helper attributed it (hostedBy).
      const owner = foreignOwner(element)
      if (owner !== null && !this.scope.includes(owner) && !(typeof element.hostedBy === 'string' && element.hostedBy.length > 0)) {
        throw targetOutOfScope(owner, point)
      }
      if (element.role === 'AXMenuItem') menuItem = true
    }
    return { menuItem }
  }

  /** What a refused hit test becomes (see `#assertTargetsInScope`): never a pass. */
  #hitTestRefusal(error, point) {
    if (!(error instanceof EnvironmentError)) return targetUnverified(point, 'the helper\'s hit test failed')
    if (error.code === 'system_prompt') { // CU-76: the helper's own word, a hand-off - never 'unverified'
      this.systemPrompt = true
      return error
    }
    if (this.link.lost || PASS_THROUGH.includes(error.code)) return error
    // A helper that refuses the hit test names the app it refused for when it knows it (D-045: the element's owner
    // when it differs from the window's); the person and agent core's ask need that id, the model never reads it.
    if (error.code === 'out_of_scope') return error.details?.reason === 'no_scope' ? error : targetOutOfScope(typeof error.details?.bundleId === 'string' ? error.details.bundleId : null, point)
    return targetUnverified(point, `the helper refused the hit test (${error.code})`, { helperCode: error.code })
  }

  /**
   * A `secure_input` refusal marks the run's state, so agent core's app policy hands key actions to the person; a
   * `local_input` one no event announced stops the run as local input does (`#localInputAnswer`).
   */
  #noteRefusal(error) {
    if (!(error instanceof EnvironmentError)) return
    if (error.code === 'secure_input') this.secureInput = true
    if (error.code === 'system_prompt') this.systemPrompt = true
    if (error.code === 'taken_over') this.#localInputAnswer(error)
  }

  /**
   * The deadline of a settling input: the helper may wait up to its cap before it posts the first step, and a request
   * that times out ends the link, so the cap is added to the link's own request timeout.
   */
  #settleTimeoutMs() {
    return this.#requestTimeoutMs() + SETTLE_CAP_MS
  }

  /** The link's own request timeout, the base every longer deadline adds to. */
  #requestTimeoutMs() {
    return Number.isFinite(this.link.requestTimeoutMs) ? this.link.requestTimeoutMs : REQUEST_TIMEOUT_MS
  }

  /**
   * CU-64 C1-C3: where the pointer is, in frame pixels - the helper's `cursor` (global points) mapped with the frame,
   * at the run's scale (simulated scale and region included). Off the frame, or on another display, it says so and
   * gives no coordinates the model could act on. An older helper (unknown_request) gets the last point this driver
   * sent, labelled as such - null after a person had the Mac (D5).
   */
  async #cursor() {
    let reply
    try {
      reply = await this.link.request('cursor', {})
    } catch (error) {
      if (error instanceof EnvironmentError && error.details?.reason === 'unknown_request') return { cursor: this.pointer, source: 'last_pointer' }
      throw error
    }
    const display = Number.isInteger(reply.display) ? reply.display : null
    const onDisplay = display === null || this.frame.display === null || display === this.frame.display
    const at = Number.isFinite(reply.xPt) && Number.isFinite(reply.yPt) ? toFrame({ x: reply.xPt, y: reply.yPt }, this.frame) : null
    const inside = onDisplay && at !== null && at.x >= 0 && at.y >= 0 && at.x < this.frame.width && at.y < this.frame.height
    // CU-133: rounded, then kept on the frame - a pointer in the last point column maps to just under frame.width, which
    // rounds to frame.width: a pixel the screenshot does not have and a click would refuse.
    const pixel = inside ? { x: Math.min(Math.round(at.x), this.frame.width - 1), y: Math.min(Math.round(at.y), this.frame.height - 1) } : null
    return inside ? { cursor: pixel, source: 'helper' } : { cursor: null, offFrame: true, source: 'helper' }
  }

  /**
   * Plan a whole batch as `perform` would plan each action, and send nothing: the first action that cannot be planned
   * throws the very error `perform` would throw for it (same code and message; `details.index` added), so a batch
   * with one refused action - an unknown key, a drag over its point cap, a repeat over its cap, `navigate`, an
   * unknown type, a point outside the frame - is refused before any of it runs (R15, R19); copy, cut and paste chords
   * plan like any other chord (D-031) and are not refused here. Pure:
   * it needs only the frame, never the helper, so it answers even while the helper is busy or gone; only a closed
   * environment refuses, `closed`, as `state()` does. Run-time gates (run control, a local-input stop, the grants, the
   * scope) are not planning and stay with `perform`.
   *
   * Returns `{ ok: true, steps }` synchronously (safe to await), `steps` the number of low-level helper events per
   * action (0 for the actions the driver does itself: `wait`, `screenshot`, `zoom`, `cursor_position`). The frame is
   * known from launch but only confirmed once the first approved app joined the scope (`addApp`), so before that every
   * batch is refused as `perform` refuses every action then: `out_of_scope`, `details.reason: 'no_scope'`.
   */
  planBatch(actions) {
    if (this.closed) throw new EnvironmentError('closed', 'the environment is closed')
    if (!this.#frameConfirmed) throw noScopeRefusal()
    const plans = planBatch(actions, this.frame, { mode: this.mode })
    return { ok: true, steps: plans.map((plan) => plan.input?.length ?? 0) }
  }

  /** Synchronous, from cached facts, as the loop and the fake environment expect; safe to await. */
  state() {
    if (this.closed) throw new EnvironmentError('closed', 'the environment is closed')
    return {
      url: this.#url(),
      title: this.title,
      loading: false,
      tabs: [],
      dialog: null,
      frontmostBundleId: this.frontmostBundleId,
      scope: [...this.scope],
      pauseArmed: this.pauseArmed,
      localInput: this.localInputAt,
      // Read by agent core's app policy (`context.secureInput`): key actions go to the person while it is true.
      secureInput: this.secureInput,
      // Read by agent core's app policy (`context.systemPrompt`, CU-76): every key action goes to the person while true.
      systemPrompt: this.systemPrompt,
      // CU-64 G1: what a helper that died mid-hold left down and this helper released at its start (null: nothing).
      releasedStale: this.releasedStale,
      // CU-100: no window of an approved app is on screen (the latest capture or watch frame); the live view says so.
      noAppWindow: this.noAppWindow,
      grants: { ...this.grants },
    }
  }

  /**
   * An accessibility element as the target shape the policy reads (action-policy.md, input-and-targets.md): `name`
   * the title or description, `role` the AX role, `origin` the bundle id, `fingerprint` over bundle id, role, title and
   * frame - the bundle id, so two apps' identical-looking buttons are never one target in an approval or a repeated
   * block. A secure field is `isPassword` and its value is never asked for.
   *
   * `opaque` (an unnamed generic element - a canvas or a poorly exposed app) is the helper's, passed through, and
   * drives the policy's `unknown_target` confirm. A helper from before design 0.3 does not send it; then the driver
   * derives it from the same rule, so the confirm is never lost to an older helper.
   *
   * `hostedBy` names the out-of-process service that draws an element the helper attributed to its client app - an
   * open or save panel (file-panels.md, Q-D13) - so agent core can class its final button `file_choice`; null for
   * every other element, and from a helper that does not attribute. It joins the fingerprint only when present, so a
   * panel's button is never one approval target with a look-alike in the app's own window, and no other fingerprint
   * changes.
   */
  #describe(element) {
    if (element === null || element === undefined) return null
    const rect = element.frame ?? null
    // CU-194 (password-memory.md rule 1): an entry's identity across a show-password toggle that swaps a secure field for
    // a plain one in its place - the bundle id, the process and the frame's top-left relative to its window (the
    // helper's windowOrigin, a sheet's own; else the screen frame, so a window moved between the two reads loses the
    // memory, the named limit). Not its size: a custom toggle often narrows the plain field for an eye button, and a
    // top-left already tells one entry from another in a window (cu-researcher); a different field later drawn there is
    // the named over-ask. No role, title or secure flag, which the swap changes. Entries only, as agent core reads them
    // (policy.mjs isTextEntry); a process that quits takes its keys with it. Outside the fingerprint, never recorded.
    const entry = element.secure === true || (element.editable !== false && (element.editable === true || ENTRY_ROLES.includes(element.role)))
    const windowOrigin = pointOf(element.windowOrigin)
    const keyable = entry && typeof element.bundleId === 'string' && element.bundleId !== '' && Number.isInteger(element.pid)
      && rect !== null && Number.isFinite(rect.x) && Number.isFinite(rect.y)
    const fieldKey = keyable
      ? createHash('sha256').update(['field', element.bundleId, element.pid, rect.x - (windowOrigin?.x ?? 0), rect.y - (windowOrigin?.y ?? 0)].join('|')).digest('hex').slice(0, 32)
      : null
    const hostedBy = typeof element.hostedBy === 'string' && element.hostedBy.length > 0 ? element.hostedBy : null
    // CU-39, D-045 (helper): `panel` marks an element inside AppKit's own open or save panel (by its identifiers, not a
    // title), so agent core asks file_choice for an in-process panel too; 'unknown' (the walk hit its limit or an AX
    // error) is asked each time, and any other value the helper sends is read as 'unknown' - never as 'not a panel'.
    // `elementOwner` names the process that owns the element when it is not the window's owner (the reply is
    // owner-only then). Each joins the fingerprint only when present, so a button in a panel is another target.
    const panel = panelOf(element.panel)
    const elementOwner = foreignOwner(element)
    const fingerprint = createHash('sha256')
      .update([element.bundleId ?? '', element.role ?? '', element.title ?? '', rect?.x ?? '', rect?.y ?? '', rect?.width ?? '', rect?.height ?? ''].join('|')
        + (hostedBy !== null ? `|${hostedBy}` : '') + (panel !== null ? `|panel=${panel}` : '') + (elementOwner !== null ? `|elementOwner=${elementOwner}` : '')
        + (element.systemPrompt === true ? '|systemPrompt' : ''))
      .digest('hex').slice(0, 32)
    const named = typeof element.title === 'string' && element.title.trim().length > 0
    const opaque = typeof element.opaque === 'boolean' ? element.opaque : OPAQUE_ROLES.includes(element.role) && !named
    return {
      tag: null,
      role: element.role ?? null,
      subrole: element.subrole ?? null,
      name: element.title ?? null,
      href: null,
      inputType: null,
      isPassword: element.secure === true,
      secure: element.secure === true,
      autocomplete: null,
      origin: element.bundleId ?? null,
      hostedBy,
      panel,
      elementOwner,
      pid: element.pid ?? null,
      editable: typeof element.editable === 'boolean' ? element.editable : null,
      box: rectToFrame(rect, this.frame),
      opaque,
      // CU-322 (D-089): the element is, or descends from, a browser's web area (AXWebArea) - the helper's word, from the
      // parent chain at the hit test and the focused element's chain for keys. A browser that exposes its page (Safari;
      // Chrome with accessibility on) hit-tests to an AXButton or AXTextField inside it, which D-089 refuses on the
      // desktop route as web content. true or false as the helper says; absent when the helper does not say, which agent
      // core reads as unread and refuses in a browser (#204: 'absent means unread' - never null, which a strict check
      // could take for a read). Outside the fingerprint, never in run records.
      ...(typeof element.inWebArea === 'boolean' ? { inWebArea: element.inWebArea } : {}),
      // CU-76: part of a system privacy or permission prompt (the helper's, from structure); agent core hands it off.
      systemPrompt: element.systemPrompt === true,
      // CU-154: a menu item's key equivalent ({ char, modifiers }), so agent core knows Copy, Cut and Paste by the
      // keys they are bound to, in any language; null on anything else and from an older helper. Outside the
      // fingerprint: the same item is the same target whatever its shortcut reads.
      keyEquivalent: keyEquivalentOf(element.keyEquivalent),
      // CU-250 (helper 0.2.53): a menu item under the Services menu, and its menu path - outside the fingerprint, and never in
      // run records (an event's target keeps origin, role and name).
      ...(servicesMenuOf(element.servicesMenu) ? { servicesMenu: true } : {}),
      // CU-398 (helper 0.2.67): a menu item under the Apple menu (Restart..., Shut Down..., Log Out...), structural.
      ...(element.appleMenu === true ? { appleMenu: true } : {}),
      // CU-382 (helper 0.2.66): under Finder's Quick Actions (a submenu or the preview pane's row), and a menu walk
      // that could not finish - each present only when true; outside the fingerprint, and never in run records.
      ...(element.quickActions === true ? { quickActions: true } : {}),
      ...(element.menuContextUnread === true ? { menuContextUnread: true } : {}),
      // CU-392 (helper 0.2.67): where a drop in Finder sends a file - 'airdrop', 'shared' or 'server' - from Finder's own
      // strings in the helper (the raw title never leaves it); present only when one of those.
      ...(['airdrop', 'shared', 'server'].includes(element.dropDestination) ? { dropDestination: element.dropDestination } : {}),
      menuPath: menuPathOf(element.menuPath),
      // CU-187: the label that captions a non-entry element (AXTitleUIElement's title, else its row's or cell's sibling
      // title, as the helper reads it) - never its value or its own title. A string of at most 80 characters, null when
      // absent (an older helper) or malformed. Context, not identity: outside the fingerprint, and never in run records.
      caption: typeof element.caption === 'string' && element.caption.trim() !== '' ? element.caption.trim().slice(0, 80) : null,
      // CU-349 (helper 0.2.63): an entry's placeholder as the helper reads it (AXPlaceholderValue, never the value) - an
      // extra name source the consent field rules may use to ask, never to replace a name. A string of at most 80
      // characters (longer reads as none), null when absent (an older helper) or malformed. Outside the fingerprint, and
      // never in run records.
      placeholder: placeholderOf(element.placeholder),
      // CU-361 (helper 0.2.64): a static text beside an entry in layout (left on its row, else just above it), as the
      // helper reads it only when the entry has no title, caption or placeholder - a layout label agent core uses
      // upgrade-only. Trimmed, at most 80 characters (longer reads as none), else null (absent from an older helper, or
      // malformed). Outside the fingerprint, and never in run records.
      nearbyLabel: nearbyLabelOf(element.nearbyLabel),
      // CU-372 (helper 0.2.65): a pop-up button's menu items as the helper read them closed (popUpOf) - what keyTarget and
      // typeOptions turn into the item a key or a type selects. Outside the fingerprint, and never in run records.
      ...(element.role === 'AXPopUpButton' || element.role === 'AXMenuButton' ? { popUp: popUpOf(element.popUp) } : {}),
      // CU-380 (helper 0.2.65): a menu is tracking - set by the helper on whatever focus it returns then (the highlighted
      // item, a stale first responder, or an AXMenu placeholder), so agent core asks on Return or Space unless it can
      // judge the item. Present only when true; outside the fingerprint, and never in run records.
      ...(element.menuOpen === true ? { menuOpen: true } : {}),
      // CU-255: the file the element shows and its URL's last component, what launch_code reads besides the name - Finder
      // may hide an extension in the title (Payload for Payload.app or install.command). Outside the fingerprint, and
      // never in run records (an event's target keeps origin, role and name); the URL's path never leaves the driver.
      filename: fileNameOf(element.filename),
      url: fileUrlLeafOf(element.url),
      // CU-387 (helper 0.2.67): 'ancestor' when the helper lent a content element (a row's text, image or cell) the
      // nearest row's or cell's AXFilename/AXURL - a kind for the run record (CU-391), judged exactly as an own file name.
      // Present only then; outside the fingerprint.
      ...(element.fileFrom === 'ancestor' ? { fileFrom: 'ancestor' } : {}),
      // CU-392: a drop onto a server or network share sends the file away - a boolean from AXURL's scheme, only when true.
      ...(networkVolumeOf(element.url) ? { networkVolume: true } : {}),
      // CU-265: a link's scheme (AXLink's AXURL), so a facetime:, tel: or mailto: link is not a plain click. Links only - a
      // file browser's items carry file: URLs and are judged by launch_code - and the scheme only, never the URL.
      linkScheme: element.role === 'AXLink' ? linkSchemeOf(element.url) : null,
      fingerprint,
      ...(fieldKey !== null ? { fieldKey } : {}),
    }
  }

  /** The element at a frame point (AX hit-test at the global point), or null on empty space. */
  async inspectPoint({ x, y } = {}) {
    this.#assertInScope()
    checkPoint({ x, y }, this.frame)
    const at = toGlobal({ x, y }, this.frame)
    const reply = await this.link.request('hitTest', { xPt: at.x, yPt: at.y })
    const element = this.#describe(reply.element)
    return element === null ? null : { ...element, pasteboardChangeCount: changeCountOf(reply.changeCount), textEntered: textEnteredOf(reply.textEntered) }
  }

  /**
   * The focused element of the frontmost approved app, or null. CU-142: it carries `defaultButton`, the button Return
   * presses there - the focused sheet's default button when focus is in a sheet, else the window's - as
   * `{ role, name, panel }`, or null when the helper reports none (an older helper sends no field). Agent core judges
   * a Return by that name too, so Return in an unnamed message field whose default button is 'Send' is a submit. It is
   * context, not identity: it stays out of the fingerprint, so the settle read and the re-check after an approval
   * compare the focused element alone. With no focused element the answer stays null, as before. CU-190: beside it,
   * `defaultButtonRead` - whether the helper could read that button (true, false, or null from an older helper), also
   * context and outside the fingerprint, so an unreadable default button is not mistaken for none.
   */
  async focusedElement() {
    this.#assertInScope()
    return this.#focusedOf(await this.link.request('focused', {}))
  }

  /**
   * CU-372: a plain key on a focused pop-up button is judged by the item it selects (popUpKeyItem) - the item as a target
   * with selectOption: true, or the button with optionUnread: true when the menu or the landing cannot be read. Any other
   * key, or any other focus, gives the focus as before (agent core's keyTarget contract, as on the browser route).
   */
  async keyTarget(action) {
    const focus = await this.focusedElement()
    if (focus === null || !POPUP_ROLES.includes(focus.role) || action?.type !== 'keypress' || !Array.isArray(action.keys)) return focus
    let keys
    try {
      keys = action.keys.map((key) => normalizeKey(String(key)))
    } catch {
      return focus
    }
    const main = keys.filter((key) => !['SHIFT', 'CONTROL', 'ALT', 'META'].includes(key))
    if (main.length !== 1 || keys.some((key) => ['CONTROL', 'ALT', 'META'].includes(key))) return focus
    const landed = popUpKeyItem(focus.popUp ?? null, main[0])
    if (landed === null) return focus
    return landed.unread === true ? { ...focus, optionUnread: true } : popUpItemTarget(focus, landed.item)
  }

  /**
   * CU-372: for a type whose focus is a pop-up button, every item the typed string may select (popUpTypeItems), each a
   * target with selectOption: true, in menu order; [] when none matches; `{ unread: true }` when the menu cannot be read.
   * null for any other focus (the type is judged as before). The shape of the browser route's typeOptions (CU-370).
   */
  async typeOptions(action) {
    if (action?.type !== 'type' || typeof action.text !== 'string') return null
    const focus = await this.focusedElement()
    if (focus === null || !POPUP_ROLES.includes(focus.role)) return null
    const items = popUpTypeItems(focus.popUp ?? null, action.text)
    return Array.isArray(items) ? items.map((item) => popUpItemTarget(focus, item)) : items
  }

  /** The target focusedElement() makes of a 'focused' reply: the element, the no-focus placeholder, or null. */
  #focusedOf(reply) {
    const element = this.#describe(reply.element)
    const defaultButton = defaultButtonOf(reply.defaultButton)
    const defaultButtonRead = defaultButtonReadOf(reply.defaultButtonRead)
    const sheet = sheetOf(reply.sheet)
    const pasteboardChangeCount = changeCountOf(reply.changeCount)
    const textEntered = textEnteredOf(reply.textEntered)
    // CU-377 (helper 0.2.65): whether the clipboard holds a file, from its type names only (never a path or content) -
    // true, false, or null when unread or from an older helper (agent core reads null as unknown). Context beside the
    // change count: outside the fingerprint, and never in run records.
    const pasteboardHasFile = typeof reply.pasteboardHasFile === 'boolean' ? reply.pasteboardHasFile : null
    if (element === null) {
      // CU-148: no focused element - with keyboard navigation off the focus is the window itself - yet the helper read
      // the window: a sheet is up, or Return has a default button to press. A placeholder target (the shape of any
      // target, role and name null, noFocus) carries those facts, so agent core judges Command-D by the sheet and
      // Return by the default button. Every other no-focus answer stays null, as before: sheet false adds nothing.
      // Its origin is the app whose window the helper read (reply.app): app-policy blocks a target that names no app.
      // CU-190: a default button the helper could not read makes one too - Return still presses the window's default
      // button, so agent core must see the failed read (cu-developer-one); a positive none or an older helper does not.
      if (sheet !== true && defaultButton === null && defaultButtonRead !== false) return null
      return { ...this.#describe(appOf(reply.app)), noFocus: true, defaultButton, defaultButtonRead, sheet, pasteboardChangeCount, pasteboardHasFile, textEntered }
    }
    return { ...element, defaultButton, defaultButtonRead, sheet, pasteboardChangeCount, pasteboardHasFile, textEntered }
  }

  /**
   * CU-219: the pasteboard's change count alone, from a fresh `focused` read (the reply carries it with or without a
   * focused element) - an integer, or null as changeCountOf reads it. Agent core asks for it at a key copy, cut or paste
   * when focusedElement() is null, which drops the count with the element. The count travels beside the null target,
   * never as a placeholder target: app-policy judges every no-focus key by its target - one naming no app is refused,
   * one with no role makes Return, Space and a typed newline ask each time - so a placeholder here would change every
   * no-focus key, not only the paste. Never content (D-060), never cached: a copy raises the count after its key event.
   * Fail closed (cu-developer-one, cu-researcher): the count is given only when this same reply still reads as no focus.
   * If it now carries an element or a placeholder, focus moved after the null read (a click still landing), so the null
   * target agent core judges is stale. The answer is then null, and the paste asks as the owner's (CU-220) instead of
   * skipping the field's own rules.
   */
  async pasteboardChangeCount() {
    this.#assertInScope()
    const reply = await this.link.request('focused', {})
    return this.#focusedOf(reply) === null ? changeCountOf(reply.changeCount) : null
  }

  /**
   * The selection of the frontmost open or save panel (file-panels.md, Q-D13): `{ path, directory, name }`. `path` and
   * `directory` are canonical as the helper resolves them on disk (symlinks resolved, control characters escaped), or
   * null when the folder is unknown; `name` is the panel's name field exactly as it reads, so agent core resolves a
   * typed path itself (`~/...`, a `/`) and a helper that joins name and folder naively cannot hide one. Null when
   * nothing at all can be read. Agent core calls it just before it asks `file_choice`; an older helper
   * refuses the request `unknown_request`, which throws here and leaves agent core asking without the path.
   *
   * CU-48 (panel-folder-source.md, D-058): `shownFolderName` is the folder the panel shows (the Where or path pop-up's
   * title) - a display name, a check on a folder the run already holds and never a source; `nameFieldFocused` says
   * whether the panel's name field has focus. Both are passed through as the helper reads them; null when absent (an
   * older helper), empty or malformed, which agent core reads as no check. Agent core reads them at Go to Folder,
   * often with the name field still empty, so a reply with only these is not null.
   */
  async panelSelection() {
    this.#assertInScope()
    const reply = await this.link.request('panelSelection', {})
    const text = (value) => typeof value === 'string' && value.length > 0 ? value : null
    const path = text(reply.path)
    const name = text(reply.name)
    const shownFolderName = text(reply.shownFolderName)
    const nameFieldFocused = typeof reply.nameFieldFocused === 'boolean' ? reply.nameFieldFocused : null
    if (path === null && name === null && shownFolderName === null && nameFieldFocused === null) return null
    return { path, directory: text(reply.directory), name, shownFolderName, nameFieldFocused }
  }

  /**
   * CU-187: the copy source of selected static text - `{ role, tag: null, origin, caption }` of the element holding the
   * selection when no text entry has the focus (the helper's 'selection', helper 0.2.45), the same four keys as the
   * browser driver's. Never a value or a title: a static text's own words are the value (D-060), and its class lives
   * in its caption. Null when nothing is selected, the element is malformed or outside the approved apps (the helper
   * scopes it; this is the second check), and on any failure - an older helper refuses 'selection' unknown_request -
   * so the copy is judged by its target as before. Agent core reads it only at a copy.
   */
  async selectionSource() {
    this.#assertInScope()
    try {
      const element = (await this.link.request('selection', {}))?.element
      if (element === null || typeof element !== 'object') return null
      const origin = typeof element.bundleId === 'string' && element.bundleId.length > 0 ? element.bundleId : null
      if (origin === null || !this.scope.includes(origin)) return null
      return {
        role: typeof element.role === 'string' && element.role.length > 0 ? element.role : null,
        tag: null,
        origin,
        caption: typeof element.caption === 'string' && element.caption.trim() !== '' ? element.caption.trim().slice(0, 80) : null,
      }
    } catch {
      return null
    }
  }

  /**
   * CU-232/CU-236: the menu item a key chord would fire in the frontmost approved app, read before it is sent - AppKit
   * offers a key equivalent to the menu bar, so Shift-Command-D sends Mail's draft as surely as a click on Message >
   * Send. The helper's menuKey gets each of the chord's non-modifier keyDowns exactly as the chord would post them
   * (chordKeyDowns: one key mapping for the read and the input) and answers the matching item's title, path and key
   * equivalent of every matching item, `none` when the bar was read whole with no match, or `unreadable`. Returns
   * boundMenuItemOf's shape, the lists of a chord's keys joined; a refusal (an older helper's unknown_request), a throw
   * or a chord the planner refuses reads as `{ unreadable: true }` - agent core asks then, except for its editing chords.
   * A chord with no non-modifier key fires no item: `{ none: true }`. Read fresh each time; never cached here.
   */
  async menuItemForChord(action) {
    this.#assertInScope()
    let downs
    try {
      if (action?.type !== 'keypress' && action?.type !== 'hold_key') return { unreadable: true }
      downs = chordKeyDowns(action.keys)
    } catch {
      return { unreadable: true }
    }
    const seen = new Set()
    let bound = null
    for (const down of downs) {
      const key = `${down.keyCode}:${down.flags}`
      if (seen.has(key)) continue
      seen.add(key)
      let reply
      try {
        reply = await this.link.request('menuKey', { keyCode: down.keyCode, flags: down.flags })
      } catch {
        return { unreadable: true }
      }
      bound = combineBound(bound, boundMenuItemOf(reply, this.scope))
      if (bound.unreadable) return bound
    }
    return bound ?? { none: true }
  }

  /**
   * CU-259 (CU-252 rule 3): what a menu Open, Command-O or Command-Down acts on - the selected items of the frontmost
   * approved app's focused collection, names and kinds only (selectedItemsOf). A refusal (an older helper's
   * unknown_request) or a throw reads as `{ unreadable: true }`, so agent core asks launch_code as rule 1 does. Read
   * fresh each time, never cached; agent core decides when.
   */
  async selectedItems() {
    this.#assertInScope()
    let reply
    try {
      reply = await this.link.request('selectedItems', {})
    } catch {
      return { unreadable: true }
    }
    return selectedItemsOf(reply, this.scope)
  }

  /** Visible text of the frontmost approved window for the inspector; secure fields are left out by the helper. */
  async pageText({ maxChars = PAGE_TEXT_MAX } = {}) {
    this.#assertInScope()
    if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > PAGE_TEXT_MAX) throw invalid(`pageText maxChars must be an integer from 1 to ${PAGE_TEXT_MAX}`)
    const reply = await this.link.request('screenText', { maxChars })
    const text = typeof reply.text === 'string' ? reply.text.slice(0, maxChars) : ''
    // Hidden text is a page concept; an AX tree lists what an app exposes, so there is none to report.
    return { text, hiddenText: '', truncated: reply.truncated === true }
  }

  /** Refused by name: there is no address bar on a desktop. */
  async navigate() {
    throw new EnvironmentError('unsupported_action', NAVIGATE_REFUSAL)
  }

  /** Remote input to a real desktop is out of scope (Q-D7): a person at the Mac acts directly. */
  async humanInput() {
    throw new EnvironmentError('unsupported_action', 'remote input to the desktop is out of scope; a person at the Mac uses it directly')
  }

  /**
   * Live-view frames from the helper's `watch` (the same app-scoped capture); returns the stop function. Watch frames
   * are captures, so before any app is in scope (P11) the viewer is registered and the `watch` waits for the first
   * `addApp`: a live view opened at the start of a run - while its start apps are still being asked about - gets
   * frames once there is something approved to show, and nothing before.
   */
  async startScreencast({ onFrame, fps = 2 } = {}) {
    this.#assertUsable()
    if (typeof onFrame !== 'function') throw invalid('startScreencast needs onFrame')
    if (typeof fps !== 'number' || !(fps > 0) || fps > 5) throw invalid('screencast fps must be above 0 and at most 5')
    await this.stopScreencast()
    const cast = { onFrame, fps, watching: false }
    this.screencast = cast
    if (this.scope.length > 0 && this.#frameConfirmed) await this.#watch(cast)
    return () => this.stopScreencast()
  }

  /**
   * Send `watch` for a registered viewer, once; a viewer replaced or stopped meanwhile is left alone. Under the
   * simulateDisplay seam the watch asks for the frame's region, as every capture does, so the person's live view shows
   * the region the model sees, not the whole display (CU-83). A helper that does not know the field answers
   * `unknown_field` region and gets today's request: the live view keeps working, showing the whole display as before.
   */
  async #watch(cast) {
    if (this.screencast !== cast || cast.watching) return
    cast.watching = true
    const fields = { fps: cast.fps, maxSize: { width: this.frame.width, height: this.frame.height } }
    const region = this.#frameRegion()
    try {
      await this.link.request('watch', { ...fields, ...region })
    } catch (error) {
      // Only an older helper's unknown_field falls back; a helper that knows region and refuses it says so (CU-83).
      const unknownRegion = region.region !== undefined && error instanceof EnvironmentError && error.details?.reason === 'unknown_field' && error.details?.field === 'region'
      if (!unknownRegion) throw error
      await this.link.request('watch', fields)
    }
  }

  async stopScreencast() {
    const cast = this.screencast
    if (cast === null) return
    this.screencast = null
    if (cast.watching && !this.closed && this.lostReason === null) await this.link.request('unwatch', {}).catch(() => {})
  }

  /**
   * The design's local-input seam (human-control.md), for checks only: the helper reports a person's input through
   * one guard - `via` `tap`, `idle` or `untagged` - as `localInput {at, kind}`, so each guard's pause is proven without
   * a person. The helper sends that event before its reply, so the driver's stop already holds when this resolves -
   * except during a settle, where it pauses nothing (see `#onLocalInput`); like a real local input it can only pause.
   * `untagged` posts a real event, so it passes the same gates as input. Resolves `{ at, detectedBy }`, the guard the
   * helper says saw it.
   */
  async simulateLocalInput({ kind = 'key', via } = {}) {
    this.#assertUsable()
    if (!LOCAL_INPUT_VIA.includes(via)) throw invalid(`simulateLocalInput via is one of ${LOCAL_INPUT_VIA.join(', ')}`, { field: 'via' })
    if (!LOCAL_INPUT_KINDS.includes(kind)) throw invalid(`simulateLocalInput kind is one of ${LOCAL_INPUT_KINDS.join(', ')}`, { field: 'kind' })
    if (via === 'untagged') this.#checkGates()
    const reply = await this.link.request('simulateLocalInput', { kind, via })
    return { at: this.localInputAt, detectedBy: typeof reply.detectedBy === 'string' ? reply.detectedBy : null }
  }

  /**
   * Idempotent: says `bye` (the helper drops its scope and exits), closes the link, removes the run directory, and
   * releases the desktop-run lock last - even when an earlier step fails - so the next run waits for this helper.
   */
  close() {
    this.closePromise ??= this.#close()
    return this.closePromise
  }

  async #close() {
    this.closing = true
    this.screencast = null
    try {
      if (this.lostReason === null && !this.link.lost && this.link.hello !== null) {
        await this.link.request('bye', {}, { timeoutMs: BYE_TIMEOUT_MS }).catch(() => {})
      }
      this.closed = true
      this.#unsubscribeControl?.()
      this.link.close()
      await this.server?.close()
    } finally {
      this.#releaseRun()
    }
  }
}
