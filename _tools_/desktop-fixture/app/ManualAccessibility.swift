import AppKit

/// CU-329 (live row 5): CU Fixture answers `AXManualAccessibility` on its application element the way an Electron app
/// does - no value until someone sets it, then the stored boolean - so a verifier can watch CUHelper's one
/// Accessibility write and its restore without Accessibility trust of its own. Every write from outside (the helper)
/// is kept in order, value only, outside the general event log; the harness reads them over the channel (`manualAX`) and may preset the attribute
/// to true (`manualAXPreset`) to show the helper's leave-alone branch. Presets are not writes.
final class FixtureApplication: NSApplication {
  static let manualAttribute = NSAccessibility.Attribute(rawValue: "AXManualAccessibility")

  /// nil while never set (the helper's read sees 'no value', which it counts as unset).
  var manualAccessibility: Bool?
  /// Every external write, oldest first.
  var manualWrites: [Bool] = []

  override func accessibilityAttributeNames() -> [NSAccessibility.Attribute] {
    let names = super.accessibilityAttributeNames()
    return names.contains(Self.manualAttribute) ? names : names + [Self.manualAttribute]
  }

  override func accessibilityAttributeValue(_ attribute: NSAccessibility.Attribute) -> Any? {
    guard attribute == Self.manualAttribute else { return super.accessibilityAttributeValue(attribute) }
    return manualAccessibility.map { NSNumber(value: $0) }
  }

  override func accessibilityIsAttributeSettable(_ attribute: NSAccessibility.Attribute) -> Bool {
    attribute == Self.manualAttribute ? true : super.accessibilityIsAttributeSettable(attribute)
  }

  override func accessibilitySetValue(_ value: Any?, forAttribute attribute: NSAccessibility.Attribute) {
    guard attribute == Self.manualAttribute else { return super.accessibilitySetValue(value, forAttribute: attribute) }
    let on = (value as? NSNumber)?.boolValue ?? false
    manualAccessibility = on
    // Only here, never in the fixture's general events: every helper run that has CU Fixture frontmost makes this
    // write (and, from 0.2.62, its restore), and checks that count events after a run must not see them (cu-developer-three).
    manualWrites.append(on)
  }

  /// The channel's view: the current value (null while never set) and every write in order.
  static func report() -> [String: Any] {
    guard let app = NSApp as? FixtureApplication else { return ["supported": false] }
    return ["supported": true, "value": app.manualAccessibility.map { $0 as Any } ?? NSNull(), "writes": app.manualWrites]
  }

  /// Test seam: set the attribute without recording a write (the 'set by the user or another assistive app' case), or
  /// clear it back to no value with `nil`. Clears the write log too, so each live row starts from a known state.
  static func preset(_ on: Bool?) {
    guard let app = NSApp as? FixtureApplication else { return }
    app.manualAccessibility = on
    app.manualWrites = []
  }
}
