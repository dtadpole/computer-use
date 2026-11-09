import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { frameFor } from '../../_environments_/macos-desktop/coords.mjs'
import { REQUEST_FIELDS } from '../../_environments_/macos-desktop/helper-link.mjs'
import { planAction } from '../../_environments_/macos-desktop/input-plan.mjs'
import { BUNDLE_ID } from '../../_environments_/macos-desktop/launch.mjs'

/**
 * Static checks of the Swift helper's sources (moved here from the macos-desktop suite with the helper, D-026): the
 * APIs that can raise a TCC prompt or touch the pasteboard are absent, gated APIs live only where the grant check
 * guards them, and the protocol tables and the bundle id agree with the Node driver.
 */

const HELPER = fileURLToPath(new URL('../../_environments_/macos-desktop/helper/', import.meta.url))
const SOURCES = join(HELPER, 'Sources')
const files = Object.fromEntries(readdirSync(SOURCES).filter((name) => name.endsWith('.swift')).map((name) => [name, readFileSync(join(SOURCES, name), 'utf8')]))
/** Code without comments, so documentation may name the APIs it refuses to call. */
const code = Object.fromEntries(Object.entries(files).map(([name, text]) => [name, text.split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n')]))
const where = (pattern) => Object.entries(code).filter(([, text]) => pattern.test(text)).map(([name]) => name).sort()

test('no prompting, pasteboard or legacy capture API appears in the helper code, except the owner\'s --request-grants', () => {
  const forbidden = [
    /CGRequestPostEventAccess/, /CGRequestListenEventAccess/, /IOHIDRequestAccess/,
    /UIPasteboard/, /CGWindowListCreateImage/, /CGDisplayCreateImage/, /CGDisplayStream/,
    /kCGWindowName/, /kCGWindowOwnerName/, /NSAppleScript/, /Process\(\)/, /SecKeychain/, /SecItemCopyMatching/,
  ]
  for (const pattern of forbidden) assert.deepEqual(where(pattern), [], String(pattern))
  // CU-151: the pasteboard appears exactly once, as its change count - a number, never content (D-031, D-056) - and no
  // content or write API appears anywhere.
  const pasteboardUses = Object.entries(code).flatMap(([name, text]) => [...text.matchAll(/NSPasteboard[\w.]*/g)].map((match) => `${name}: ${match[0]}`))
  assert.deepEqual(pasteboardUses, ['SystemCapabilities.swift: NSPasteboard.general.changeCount'], 'only the change count')
  for (const pattern of [/\.string\(forType/, /\.data\(forType/, /propertyList\(forType/, /readObjects\(/, /pasteboardItems/, /clearContents\(/,
    /setString\(/, /setData\(/, /writeObjects\(/, /declareTypes\(/, /\.types\b/]) {
    assert.deepEqual(where(pattern), [], `no pasteboard content or write API: ${pattern}`)
  }
  // The two prompts the owner asked for (2026-11-05) live in RequestGrants.swift alone, reached only from main.swift's
  // --request-grants case - never from serving, the self-test or the dry run.
  for (const pattern of [/CGRequestScreenCaptureAccess\(\)/, /AXIsProcessTrustedWithOptions\(/, /kAXTrustedCheckOptionPrompt/]) {
    assert.deepEqual(where(pattern), ['RequestGrants.swift'], String(pattern))
  }
  assert.deepEqual(where(/GrantRequest\.run\(/), ['main.swift'])
  // WindowServer's owner list (2026-11-05): owners only, in one place; names never read (forbidden above).
  assert.deepEqual(where(/CGWindowListCopyWindowInfo/), ['SystemCapabilities.swift'])
  assert.match(code['main.swift'], /case \.requestGrants:\n  exit\(GrantRequest\.run\(/, 'only the --request-grants command reaches it, and it exits')
  assert.doesNotMatch(code['RequestGrants.swift'], /SCShareableContent|SCScreenshotManager|CGEvent|tapCreate|CGPreflightListenEventAccess\(\) *\{/, 'it captures nothing, posts nothing, installs no tap')
})

test('grants are read only through the prompt-free preflights', () => {
  assert.deepEqual(where(/CGPreflightScreenCaptureAccess\(\)/), ['Policy.swift', 'SystemCapabilities.swift'])
  assert.deepEqual(where(/CGPreflightPostEventAccess\(\)/), ['Policy.swift', 'SystemCapabilities.swift'])
  assert.deepEqual(where(/AXIsProcessTrusted\(\)/), ['LocalInput.swift', 'Policy.swift', 'SystemCapabilities.swift'])
  assert.match(code['LocalInput.swift'], /let active = AXIsProcessTrusted\(\)\n    guard active \|\| CGPreflightListenEventAccess\(\) else \{ return false \}[\s\S]*CGEvent\.tapCreate/, 'the tap only when a grant already allows it')
  assert.deepEqual(where(/CGEvent\.tapCreate/), ['LocalInput.swift'])
  assert.match(code['LocalInput.swift'], /options: active \? \.defaultTap : \.listenOnly/, 'active pass-through with Accessibility, else listen-only')
  assert.match(code['LocalInput.swift'], /return Unmanaged\.passUnretained\(event\)\n\}/, 'the callback hands every event back unchanged')
})

test('capture and input APIs live only in the live capabilities, behind the dispatcher\'s grant check', () => {
  assert.deepEqual(where(/SCShareableContent|SCScreenshotManager|SCContentFilter/), ['SystemCapabilities.swift'])
  assert.deepEqual(where(/\.post\(tap:|postToPid/), ['SystemCapabilities.swift'])
  assert.deepEqual(where(/AXUIElementCopyElementAtPosition/), ['Accessibility.swift'])
  assert.match(code['SystemCapabilities.swift'], /guard CGPreflightScreenCaptureAccess\(\) else/, 'capture re-checks its grant')
  assert.match(code['SystemCapabilities.swift'], /guard CGPreflightPostEventAccess\(\)/, 'posting re-checks its grant')
  assert.match(code['Events.swift'], /CGEventSource\(stateID: \.privateState\)/, 'a private event source')
  assert.match(code['Events.swift'], /setIntegerValueField\(\.eventSourceUserData, value: HelperIdentity\.eventTag\)/, 'every event tagged')
  assert.match(code['Policy.swift'], /static let eventTag: Int64 = 0x4355_5345/, 'the tag is CUSE (input-and-targets.md)')
  assert.match(code['SystemCapabilities.swift'], /SCContentFilter\(display: scDisplay, including: included\)/, 'a window-scoped filter, rebuilt per capture (0.4.6)')
  assert.match(code['SystemCapabilities.swift'], /CaptureScope\.approves\(sckBundleId: window\.owningApplication\?\.bundleIdentifier, appKitBundleId: owners\[window\.windowID\]\.flatMap \{ Accessibility\.bundleId\(pid: \$0\) \}/, 'each window owner checked by WindowServer pid through AppKit too')
  assert.doesNotMatch(code['SystemCapabilities.swift'], /including: apps|applicationName|kCGWindowOwnerName/, 'never an app-level or name match')
  // CU-240: the gate reads the one grant it needs (re-read only after an earlier true) and refuses before the switch.
  assert.match(code['Dispatcher.swift'], /if let grant = request\.grant, let check = request\.grantCheck \{\n\s+let outcome = checkGrant\(check\)\n\s+if !outcome\.granted \{\n\s+return refuse\(/, 'the grant check precedes every call')
  assert.match(code['Dispatcher.swift'], /let outcome = GrantRecheck\.check\(seenTrue: seen, read: \{ capabilities\.grant\(name\) \}/, 'a gate re-reads only through GrantRecheck')
})

test('the boundary of D-029 is wired: peer check, one instance, indicator, the connect window', () => {
  // CU-303: a start that cannot hold a grant (dry run, simulated ungranted) reads no TCC; a live start settles them.
  assert.match(code['main.swift'], /let grantsAtStart = GrantRecheck\.atStart\(mayHoldGrants: options\.mayHoldGrants, read: \{ Grants\.preflight\(\) \}, sleep: \{ Thread\.sleep\(forTimeInterval: \$0\) \}\)\nlet boundary = options\.boundaryApplies\(grantsAtStart: grantsAtStart\)/)
  assert.match(code['Policy.swift'], /static func atStart\(mayHoldGrants: Bool, read: \(\) -> Grants, sleep: \(TimeInterval\) -> Void\) -> Grants \{\n    mayHoldGrants \? settled\(read: read, sleep: sleep\) : \.none\n  \}/, 'only a start that may hold grants reads them')
  assert.doesNotMatch(code['main.swift'], /^(?!.*GrantRecheck\.atStart\().*Grants\.preflight\(\)/m, 'main.swift reads TCC only through atStart')
  assert.match(code['main.swift'], /if options\.lockPath != nil && grantsAtStart\.any \{\n  fail\(/, 'a granted helper always takes the shared lock')
  assert.match(code['main.swift'], /let forcedUngranted = options\.simulateUngranted \|\| \(options\.mayHoldGrants && !boundary\)/, 'no grant at the start, none for the run')
  assert.match(code['main.swift'], /if boundary && !SingleInstance\.acquire\(at: options\.lockPath \?\? SingleInstance\.lockPath\)/)
  assert.match(code['main.swift'], /if boundary \{ Indicator\.show\(\) \}\n\nlink\.send\(dispatcher\.hello/, 'the indicator is up before the hello')
  assert.match(code['main.swift'], /DispatchSource\.makeSignalSource/, 'a quit releases held input')
  assert.match(code['main.swift'], /PeerCheck\.refusal\(peer/)
  // CU-299: the compiled ~/computer-use roots are gone; only a configured checkout's entry points are served.
  assert.doesNotMatch(code['PeerCheck.swift'], /static let layouts|func checkoutRoot|func projectRoot|func isAllowedEntry/, 'no compiled checkout root remains (CU-299)')
  assert.match(code['PeerCheck.swift'], /guard configured else \{ return "the peer's script is not an allowed entry point" \}/, 'only a configured checkout admits a peer (CU-299)')
  assert.match(code['main.swift'], /"none - every peer is refused"/, 'the start line says when no checkout is configured')
  assert.match(code['PeerCheck.swift'], /guard trustedForConfig\(path, ownUid: ownUid\), trustedForConfig\(\(path as NSString\)\.deletingLastPathComponent, ownUid: ownUid\) else \{\n      return \(\[\], /, 'the config and its folder are this user\'s alone before any entry is read (CU-299)')
  assert.match(code['main.swift'], /Indicator\.show\(\)/)
  assert.match(code['main.swift'], /SocketLink\.connect\(path: path, timeout: 10\)/)
  assert.match(code['main.swift'], /cap\.schedule\(deadline: \.now\(\) \+ options\.maxRunSeconds\)/, 'the wall-time cap')
  assert.match(code['Arguments.swift'], /var mayHoldGrants: Bool \{ !dryRun && !simulateUngranted \}/)
})

test('every peer entry point in Swift exists, and the boundary stand-in only waits for the hello and says bye (design 0.3.5)', () => {
  const list = /static let entryPoints = \[([\s\S]*?)\]/.exec(code['PeerCheck.swift'])
  assert.notEqual(list, null)
  const entries = [...list[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(entries, ['_tools_/agent-core/cli.mjs', '_tools_/computer-use-mcp/server.mjs', '_evaluators_/desktop-suite/run.mjs', '_verifiers_/desktop-helper-boundary/stand-in-driver.mjs'])
  const project = fileURLToPath(new URL('../../', import.meta.url))
  for (const entry of entries) assert.ok(existsSync(join(project, entry)), `${entry} exists`)
  const standIn = readFileSync(join(project, '_verifiers_/desktop-helper-boundary/stand-in-driver.mjs'), 'utf8')
  const sends = [...standIn.matchAll(/socket\.write\(([^\n]*)\)/g)].map((m) => m[1])
  assert.equal(sends.length, 1, 'the stand-in writes to the helper once')
  assert.match(sends[0], /type: 'bye'/, 'and that write is bye')
  for (const request of ['capture', 'input', 'scope', 'hitTest', 'focused', 'screenText', 'watch', 'pauseOnLocalInput', 'simulateLocalInput']) {
    assert.doesNotMatch(standIn, new RegExp(`type: ['"]${request}['"]`), `the stand-in never sends ${request}`)
  }
})

test('the unified log carries reason codes, pids and exit codes only - never the token, a title, text or an event', () => {
  const lines = [...files['main.swift'].matchAll(/\b(?:note|endRun)\(("[^\n]*)\)/g)].map((m) => m[1])
  assert.ok(lines.length >= 10, `start, peer decision and every end are logged (${lines.length})`)
  for (const line of lines) assert.doesNotMatch(line, /token|title|text|event|png|path/i, line)
  assert.deepEqual(Object.keys(code).filter((file) => /Logger\(|os_log|NSLog\(/.test(code[file])), ['main.swift'], 'one place logs')
})

test('the bundle id is the same in Swift, build.sh and launch.mjs', () => {
  assert.equal(BUNDLE_ID, 'com.reflection.cu-helper')
  assert.match(files['Policy.swift'], new RegExp(`static let bundleId = "${BUNDLE_ID.replace(/\./g, '\\.')}"`))
  assert.match(readFileSync(join(HELPER, 'build.sh'), 'utf8'), new RegExp(`^BUNDLE_ID="${BUNDLE_ID.replace(/\./g, '\\.')}"`, 'm'))
})

/** Parse a Swift `[String: Set<String>]` literal such as `"scope": ["bundleIds"],` from one static table. */
function swiftTable(name) {
  const block = new RegExp(`static let ${name}: \\[String: Set<String>\\] = \\[([\\s\\S]*?)\\n  \\]`).exec(files['Protocol.swift'])
  assert.notEqual(block, null, name)
  const table = {}
  for (const match of block[1].matchAll(/"(\w+)": \[([^\]]*)\]/g)) table[match[1]] = [...match[2].matchAll(/"(\w+)"/g)].map((m) => m[1]).sort()
  return table
}

test('the Swift request table is the driver\'s, request for request and field for field, seams included', () => {
  const swift = swiftTable('fields')
  const node = Object.fromEntries(Object.entries(REQUEST_FIELDS).map(([type, fields]) => [type, [...fields].sort()]))
  assert.deepEqual(swift, node)
})

test('every event the planner emits has exactly the fields the Swift helper requires for its kind', () => {
  const swift = swiftTable('eventFields')
  const frame = frameFor({ originPt: { x: 0, y: 0 }, sizePt: { width: 800, height: 600 }, scale: 1 }, 1)
  const actions = [
    { type: 'click', x: 1, y: 1, button: 'back', keys: ['SHIFT'] }, { type: 'double_click', x: 1, y: 1 }, { type: 'triple_click', x: 1, y: 1 },
    { type: 'move', x: 1, y: 1 }, { type: 'drag', path: [{ x: 1, y: 1, holdMs: 500 }, { x: 90, y: 9 }] }, { type: 'scroll', x: 1, y: 1, scroll_x: 3, scroll_y: -3 },
    { type: 'keypress', keys: ['META', 'A'] }, { type: 'type', text: 'a\tb\nc' },
  ]
  const seen = new Set()
  for (const action of actions) {
    for (const event of planAction(action, frame).input) {
      seen.add(event.kind)
      assert.deepEqual(Object.keys(event).sort(), swift[event.kind], `${action.type} ${event.kind}`)
    }
  }
  assert.deepEqual([...seen].sort(), Object.keys(swift).sort(), 'the planner uses every kind the helper knows (a drag\'s dwell is the hold step, CU-64)')
})

test('the live capture and the dry run include the menu bar only on the display that holds its strip (CU-51)', () => {
  const live = readFileSync(join(HELPER, 'Sources', 'SystemCapabilities.swift'), 'utf8')
  const dry = readFileSync(join(HELPER, 'Sources', 'DryRun.swift'), 'utf8')
  assert.match(live, /approvedMenuBar\(scope: request\.scope\)\.flatMap \{ MenuBarPlan\.include\(strip: \$0\.strip, display: bounds\)/, 'the live capture no longer gates the menu bar on its display')
  assert.match(live, /filter\.includeMenuBar = menuBar != nil/, 'the menu bar is included apart from the gated plan')
  assert.match(dry, /MenuBarPlan\.include\(strip: strip, display: request\.display\.bounds\)/, 'the dry run no longer models the gate')
})

test('the live capture is configured by CaptureConfig, which scales the source to the requested pixels (CU-74)', () => {
  const live = readFileSync(join(HELPER, 'Sources', 'SystemCapabilities.swift'), 'utf8')
  assert.match(live, /let config = CaptureConfig\.make\(area: request\.area, displayBounds: bounds, widthPx: request\.widthPx, heightPx: request\.heightPx\)/, 'the capture builds its configuration elsewhere')
  assert.match(live, /config\.scalesToFit = true/, 'ScreenCaptureKit would draw native pixels into a larger buffer (CU-74)')
  assert.equal((live.match(/SCStreamConfiguration\(\)/g) ?? []).length, 1, 'a second configuration bypasses CaptureConfig')
})

// CU-180: only the hit test lifts a point's element to its control; Q-D12's desktop reading, the owner and pid checks
// and the text-entry scan keep the raw element (cu-verifier: a lifted role must not change how a Finder drag is read).
test('only hitTest reads the lifted action target; desktop(at:) and the pid checks read the raw element', () => {
  const source = readFileSync(join(SOURCES, 'SystemCapabilities.swift'), 'utf8')
  const lifted = [...source.matchAll(/Accessibility\.actionTarget\(at:/g)].length
  assert.equal(lifted, 1, 'one reader of the lifted target')
  const hitTest = source.slice(source.indexOf('func hitTest('), source.indexOf('func focused('))
  assert.match(hitTest, /Accessibility\.actionTarget\(at: point\)/)
  const desktop = source.slice(source.indexOf('func desktop(at point'), source.indexOf('func hitTest('))
  assert.match(desktop, /Accessibility\.element\(at: point\)/)
  assert.doesNotMatch(desktop, /actionTarget/)
})

test("CU-194: windowOrigin is read from the element's AXWindow's AXPosition, never the element's own frame", () => {
  const source = readFileSync(join(SOURCES, 'Accessibility.swift'), 'utf8')
  const fn = source.slice(source.indexOf('static func windowOrigin(of element'), source.indexOf('static func labelText('))
  assert.match(fn, /elementAttribute\(element, "AXWindow"\)/, 'the AXWindow of the element')
  assert.match(fn, /attribute\(window, "AXPosition"\)/, "that window's AXPosition")
  assert.doesNotMatch(fn, /frame\(element\)|attribute\(element, "AXPosition"\)/, "never the element's own position")
  const start = source.indexOf('static func describe(')
  const describe = source.slice(start, source.indexOf('\n  static func ', start + 1))
  assert.match(describe, /"windowOrigin": windowOrigin\(of: element\)/, 'describe() carries it for the element it describes')
})

test("CU-209: the caption rule and the selection request share one entry test - an entry role counts only when its value is settable", () => {
  const ax = readFileSync(join(SOURCES, 'Accessibility.swift'), 'utf8')
  const caption = ax.slice(ax.indexOf('static func caption('), ax.indexOf('\n  static func ', ax.indexOf('static func caption(') + 1))
  assert.match(caption, /AXUIElementIsAttributeSettable\(element, "AXValue"/)
  assert.match(caption, /Caption\.isEntry\(role: role, settable: canSet\)/)
  const system = readFileSync(join(SOURCES, 'SystemCapabilities.swift'), 'utf8')
  const selection = system.slice(system.indexOf('func selectionSource('), system.indexOf('func sheetPresent('))
  assert.match(selection, /AXUIElementIsAttributeSettable\(element, "AXValue"/)
  assert.match(selection, /Caption\.isEntry\(role: role, settable: canSet\)/)
})

test('every end but bye arms the end watchdog before anything that can wait on a lock (CU-227)', () => {
  const main = code['main.swift']
  const body = main.slice(main.indexOf('func endRun('), main.indexOf('\n}\n', main.indexOf('func endRun(')))
  const arm = body.indexOf('EndWatchdog.arm(')
  assert.ok(arm > 0, 'endRun arms EndWatchdog')
  for (const waits of ['dispatcher.abort()', 'endLock.lock()', 'dispatcher.shutdown()']) {
    assert.ok(body.indexOf(waits) > arm, `the watchdog is armed before ${waits}`)
  }
  assert.match(body, /_exit\(EndWatchdog\.exitCode\)/, 'the watchdog exits with _exit, which runs no atexit handler and takes no lock of ours')
})
