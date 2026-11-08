import AppKit
import Darwin
import Foundation
import os

/// CUHelper: the one process the owner grants Screen Recording and Accessibility (design: helper-and-protocol.md,
/// helper-boundary.md). See `HelperArguments.usage` for the command line.
///
/// The driver launches the bundle through LaunchServices (`open -g -n -a`), never as its own child, so these grants
/// are the helper's and not the terminal's. The helper serves one run (D-029): it connects back within 10 s, checks
/// the process at the other end, takes the one-helper lock, shows the indicator, says hello with the run's token,
/// serves the line protocol, and exits on `bye`, on socket loss or at the run's wall-time cap - releasing anything it
/// holds first. Without a live run it posts nothing. A dry run, `--simulate-ungranted` and a run that starts with no
/// grant can use none (the last serves with every grant forced off), so they skip the peer check, the lock and the
/// indicator; only the first two may serve over stdio.

signal(SIGPIPE, SIG_IGN)

/// The run's lines in the unified log (subsystem com.reflection.cu-helper), readable after a LaunchServices launch with
/// `log show --last 5m --predicate 'subsystem == "com.reflection.cu-helper"'`: start, peer decision, end - reason
/// codes, pids and exit codes only, never a token, a title or an event.
let runLog = Logger(subsystem: HelperIdentity.bundleId, category: "run")
func note(_ message: String) {
  runLog.notice("\(message, privacy: .public)")
}

func fail(_ message: String, code: Int32 = 2) -> Never {
  FileHandle.standardError.write(Data("cu-helper: \(message)\n".utf8))
  note("exit \(code): \(code == 64 ? "usage error" : message)")
  exit(code)
}

let options: HelperArguments
do {
  options = try HelperArguments.parse(Array(CommandLine.arguments.dropFirst()))
} catch {
  fail("\(error)\n\(HelperArguments.usage)", code: 64)
}

switch options.command {
case .selftest:
  exit(SelfTest.run(out: options.out))
case .requestGrants:
  exit(GrantRequest.run(out: options.out, waitSeconds: options.waitSeconds))
case .version:
  print("\(HelperIdentity.bundleId) \(HelperIdentity.version) protocol \(HelperProtocol.version)")
  exit(0)
case .serve:
  break
}

let capabilities: Capabilities
do {
  if options.dryRun {
    var world: JSON = .object([:])
    if let path = options.worldFile {
      guard let data = FileManager.default.contents(atPath: path), let parsed = JSONCoding.decode(data) else { throw LinkError(description: "the dry-run world cannot be read") }
      world = parsed
    }
    capabilities = try DryRunCapabilities(world: world, eventsOutPath: options.eventsOut)
  } else {
    capabilities = SystemCapabilities()
  }
} catch {
  fail(String(describing: error))
}

// D-029: the boundary applies to a run that holds a grant at its start (or is told to enforce it). A run that starts
// with none serves with every grant forced off to its end, so a grant given mid-run never reaches an unchecked peer.
// CU-240: a transient TCC false at launch is re-read (only when some grant reads true, so the boundary is unchanged).
let grantsAtStart = GrantRecheck.settled(read: { Grants.preflight() }, sleep: { Thread.sleep(forTimeInterval: $0) })
let boundary = options.boundaryApplies(grantsAtStart: grantsAtStart)
let forcedUngranted = options.simulateUngranted || (options.mayHoldGrants && !boundary)
if options.lockPath != nil && grantsAtStart.any {
  fail("--lock-path is only for runs without a grant; a granted helper always takes the shared lock", code: 64)
}

note("start \(HelperIdentity.version): \(options.dryRun ? "dry run" : forcedUngranted ? "every grant off" : "live"), boundary \(boundary ? "on" : "off")")

if boundary && !SingleInstance.acquire(at: options.lockPath ?? SingleInstance.lockPath) {
  fail("another helper is running; one helper serves one run at a time", code: 4)
}

let link: SocketLink
switch options.transport! {
case .stdio:
  link = SocketLink(readFD: 0, writeFD: 1)
case .socket(let path):
  do {
    link = try SocketLink.connect(path: path, timeout: 10)
  } catch {
    fail(String(describing: error))
  }
  if boundary {
    guard let peer = PeerCheck.peer(of: link.readFD) else {
      link.shutdown()
      fail("the driver's process could not be identified; refused", code: 3)
    }
    if let reason = PeerCheck.refusal(peer, ownUid: getuid(), home: PeerCheck.home(), expectedNode: options.driverNode,
                                      expectedEntry: options.driverEntry, resolve: PeerCheck.realPath) {
      link.shutdown()
      fail("peer pid \(peer.pid) refused: \(reason)", code: 3)
    }
    note("peer pid \(peer.pid) accepted")
  }
}

// Red team B3: the token is read only now - after the connection and, when the boundary applies, the peer check - and
// a token file beside the driver's socket is unlinked once read (B4).
let token: String
do {
  var consume = false
  if case .socket(let path) = options.transport! {
    consume = (options.tokenFile! as NSString).deletingLastPathComponent == (path as NSString).deletingLastPathComponent
  }
  token = try RunFiles.token(at: options.tokenFile!, consume: consume)
} catch {
  link.shutdown()
  fail(String(describing: error))
}

var dispatcherOptions = Dispatcher.Options()
dispatcherOptions.simulateUngranted = forcedUngranted
if case .socket(let path) = options.transport! { dispatcherOptions.runDir = (path as NSString).deletingLastPathComponent }
dispatcherOptions.interEventDelay = (options.interEventMs ?? (options.dryRun ? 0 : 8)) / 1000
dispatcherOptions.guardTolerance = options.idleToleranceMs / 1000
dispatcherOptions.syntheticResetsIdle = options.idleSyntheticResets
if let capMs = options.settleCapMs { dispatcherOptions.settleCap = capMs / 1000 }
// CU-64 G1: a live helper always keeps the held-keys marker; a dry run only when a test names one.
dispatcherOptions.heldMarkerPath = options.dryRun ? options.heldMarker : (options.heldMarker ?? HeldMarker.defaultPath)
let requests = DispatchQueue(label: "com.reflection.cu-helper.requests")
/// Taken once by whichever end comes first; a second end waits here until the process is gone.
let endLock = NSLock()
let dispatcher = Dispatcher(
  capabilities: capabilities,
  exclusions: Exclusions(additions: options.excludes),
  options: dispatcherOptions,
  send: { link.send($0) },
  onBye: {
    endLock.lock()
    note("end: bye")
    link.shutdown()
    exit(0)
  })

/// The end of the run on anything but `bye`: no queued request runs, the input in flight stops at its next step,
/// what is held is released, the scope dropped, then exit. Safe from any queue. CU-227: bounded - the watchdog is armed
/// before anything that can wait on a lock, so an end that cannot finish still exits within EndWatchdog.bound.
func endRun(_ reason: String) -> Never {
  EndWatchdog.arm(reason: reason) { why in
    // CU-227: release what is still held first - from the copy the dispatcher's locks do not guard, on a second thread,
    // waited on for about a second - then leave stopped.json for the driver (#130) and exit.
    let released = EndWatchdog.boundedRelease { progress in EndWatchdog.releaseHeld(dispatcher.heldMirror, progress: progress) }
    if let marker = dispatcherOptions.heldMarkerPath { StoppedMarker.write(reason: why, released: released, besideHeldMarker: marker) }
    note("end watchdog: '\(why)' did not finish within \(Int(EndWatchdog.bound)) s; released \(released); exit \(EndWatchdog.exitCode)")
    _exit(EndWatchdog.exitCode)
  }
  dispatcher.abort()
  endLock.lock()
  note("end: \(reason)")
  dispatcher.shutdown()
  exit(0)
}

link.onConnectionBroken { endRun("the connection broke") }

// D-029 (b): the run's wall-time cap and a driver that stops talking end the run. These timers run on their own
// queue, never behind a blocked request.
let lifetime = DispatchQueue(label: "com.reflection.cu-helper.lifetime")
let lastRequestLock = NSLock()
var lastRequestAt = ProcessInfo.processInfo.systemUptime
let cap = DispatchSource.makeTimerSource(queue: lifetime)
cap.schedule(deadline: .now() + options.maxRunSeconds)
cap.setEventHandler { endRun("the run's wall-time cap") }
cap.resume()
let idle = DispatchSource.makeTimerSource(queue: lifetime)
idle.schedule(deadline: .now() + 5, repeating: 5)
idle.setEventHandler {
  lastRequestLock.lock()
  let quiet = ProcessInfo.processInfo.systemUptime - lastRequestAt
  lastRequestLock.unlock()
  if quiet > options.idleSeconds { endRun("the driver was silent too long") }
}
idle.resume()

// SIGTERM, SIGINT, SIGHUP (a quit, a kill, a closed session): release what is held before going.
var signalSources: [DispatchSourceSignal] = []
for number in [SIGTERM, SIGINT, SIGHUP] {
  signal(number, SIG_IGN)
  let source = DispatchSource.makeSignalSource(signal: number, queue: lifetime)
  source.setEventHandler { endRun("signal \(number)") }
  source.resume()
  signalSources.append(source)
}

// Keep the guard's timer and the tap on time while the run lasts (App Nap would throttle a background helper).
let activity = ProcessInfo.processInfo.beginActivity(options: [.userInitiatedAllowingIdleSystemSleep, .latencyCritical], reason: "computer-use run")

// D-029 (c): when the boundary applies, the indicator is on every display before the hello and the first request.
if boundary { Indicator.show() }

link.send(dispatcher.hello(token: token))
// CU-64 G1: a previous helper killed mid-hold left keys down. Released first on the request queue - ahead of any request,
// which can only follow the hello. The 'releasedStale' event waits for the first request: the driver accepts the hello
// by sending it, and a line before that ends the link (cu-developer-two).
requests.async { dispatcher.pendingStale = dispatcher.releaseStaleHeld() }

/// Requests waiting on the queue; a driver never has more than a few in flight, so a flood ends the run (fail closed).
let maxPending = 64
let pendingLock = NSLock()
var pending = 0

link.startReading(
  onLine: { line in
    pendingLock.lock()
    pending += 1
    let flooded = pending > maxPending
    pendingLock.unlock()
    if flooded { endRun("too many requests waiting") }
    lastRequestLock.lock()
    lastRequestAt = ProcessInfo.processInfo.systemUptime
    lastRequestLock.unlock()
    requests.async {
      dispatcher.handle(line: line)
      pendingLock.lock()
      pending -= 1
      pendingLock.unlock()
    }
  },
  onClose: { endRun("the driver closed the connection") })

if boundary {
  // The run loop is AppKit's so the panels keep drawing.
  NSApplication.shared.run()
} else {
  // The main run loop carries the tap when one is installed; requests run on their own queue.
  RunLoop.main.run()
}
_ = activity
