/** Deliberately broken CUHelpers this verifier must fail on, applied to a /tmp copy and rebuilt by prove-failing.mjs. */

const SOURCES = '_environments_/macos-desktop/helper/Sources'

export const MUTANTS = Object.freeze([
  { name: 'peer-unchecked', why: 'the connected driver is never checked, so any process can drive the helper', mutations: [{ file: `${SOURCES}/main.swift`, find: '    if let reason = PeerCheck.refusal(peer, ownUid: getuid(), home: PeerCheck.home(), expectedNode: options.driverNode,', replace: '    if false, let reason = PeerCheck.refusal(peer, ownUid: getuid(), home: PeerCheck.home(), expectedNode: options.driverNode,' }] },
  { name: 'no-single-instance', why: 'two helpers can serve at once', mutations: [{ file: `${SOURCES}/main.swift`, find: 'if boundary && !SingleInstance.acquire(at: options.lockPath ?? SingleInstance.lockPath) {', replace: 'if false && !SingleInstance.acquire(at: options.lockPath ?? SingleInstance.lockPath) {' }] },
  { name: 'broad-entry', why: 'any project .mjs is accepted again, with no launch pins (the 0.2.0 rule)', mutations: [
    { file: `${SOURCES}/PeerCheck.swift`, find: '    if let project = projectRoot(real, root: root), entryPoints.contains(where: { real == project + $0 }) { return true }', replace: '    if let project = projectRoot(real, root: root), real.hasPrefix(project) { return true }' },
  ] },
  { name: 'flags-allowed', why: 'node options that load other code no longer refuse the peer (both the leading-dash and the argument tests: either alone still refuses, measured)', mutations: [{ file: `${SOURCES}/PeerCheck.swift`, find: '    if script.hasPrefix("-") || peer.arguments.contains(where: { argument in codeLoadingOptions.contains(where: { argument == $0 || argument.hasPrefix($0 + "=") }) }) {', replace: '    if false {' }] },
  { name: 'no-indicator', why: 'nothing on screen tells the person a driver is connected', mutations: [{ file: `${SOURCES}/main.swift`, find: 'if boundary { Indicator.show() }', replace: 'if false { Indicator.show() }' }] },
  { name: 'lingers', why: 'a helper with no driver waits forever instead of leaving after 10 s', mutations: [{ file: `${SOURCES}/Link.swift`, find: '      if Date() >= deadline { throw LinkError(description: "no driver connected within \\(Int(timeout)) s") }', replace: '      if false { throw LinkError(description: "no driver connected within \\(Int(timeout)) s") }' }] },
])
