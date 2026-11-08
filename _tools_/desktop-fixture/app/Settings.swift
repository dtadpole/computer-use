import AppKit

// CU-66 S4 'settings-tree' (cu-researcher's spec): a sidebar of sections, two tabs per section, four settings on each
// tab and an Advanced disclosure that hides two more. A task's setting sits under Advanced on one tab, so it is found
// by navigating a tree of places, not by reading one screen. Each change records 'setting'; Save records what changed.

final class SettingsTree: NSObject {
  static var shared: SettingsTree?
  static let task = "settings-tree"

  struct Setting {
    let key: String
    let label: String
    let options: [String]
  }

  struct Tab {
    let name: String
    var basic: [Setting]
    var advanced: [Setting]
  }

  /// Sections in order, each with its two tabs.
  static func tree() -> [(section: String, tabs: [Tab])] {
    func s(_ key: String, _ label: String, _ options: [String]) -> Setting { Setting(key: key, label: label, options: options) }
    return [
      ("Network", [
        Tab(name: "General", basic: [s("wifi", "Wi-Fi", ["On", "Off"]), s("ipv6", "IPv6", ["Automatic", "Link-local only", "Off"]),
                                     s("metered", "Metered connection", ["No", "Yes"]), s("hostname", "Hostname", ["Automatic", "Custom"])],
            advanced: [s("mtu", "MTU", ["Automatic", "1500", "1400", "1280"]), s("dns-over-https", "DNS over HTTPS", ["Off", "Automatic", "Strict"])]),
        Tab(name: "Proxies", basic: [s("proxy-mode", "Proxy", ["None", "Automatic", "Manual"]), s("pac", "PAC file", ["None", "Company", "Custom"]),
                                     s("bypass-local", "Bypass local", ["Yes", "No"]), s("socks", "SOCKS", ["Off", "On"])],
            advanced: [s("proxy-auth", "Proxy authentication", ["None", "Basic", "Kerberos"]), s("proxy-timeout", "Timeout", ["15 s", "30 s", "60 s"])]),
      ]),
      ("Privacy", [
        Tab(name: "History", basic: [s("history-keep", "Keep history", ["1 week", "1 month", "1 year", "Forever"]), s("history-sync", "Sync history", ["On", "Off"]),
                                     s("suggestions", "Search suggestions", ["On", "Off"]), s("recent", "Recently closed", ["Show", "Hide"])],
            advanced: [s("clear-on-exit", "Clear on exit", ["No", "Yes"]), s("private-default", "Private by default", ["No", "Yes"])]),
        Tab(name: "Cookies", basic: [s("cookies", "Cookies", ["Allow all", "Block third-party", "Block all"]), s("site-data", "Site data", ["Keep", "Clear on exit"]),
                                     s("dnt", "Do Not Track", ["Off", "On"]), s("trackers", "Tracker blocking", ["Standard", "Strict", "Off"])],
            advanced: [s("cookie-lifetime", "Cookie lifetime", ["Session", "30 days", "1 year"]), s("partitioning", "Storage partitioning", ["On", "Off"])]),
      ]),
      ("Display", [
        Tab(name: "Text", basic: [s("font-size", "Font size", ["Small", "Medium", "Large"]), s("font", "Font", ["System", "Serif", "Mono"]),
                                  s("line-spacing", "Line spacing", ["Normal", "Relaxed"]), s("text-contrast", "Text contrast", ["Normal", "High"])],
            advanced: [s("smoothing", "Font smoothing", ["Auto", "On", "Off"]), s("ligatures", "Ligatures", ["On", "Off"])]),
        Tab(name: "Colour", basic: [s("theme", "Theme", ["Light", "Dark", "Auto"]), s("accent", "Accent", ["Blue", "Green", "Orange"]),
                                    s("contrast", "Contrast", ["Normal", "High"]), s("reduce-transparency", "Reduce transparency", ["Off", "On"])],
            advanced: [s("colour-profile", "Colour profile", ["sRGB", "Display P3"]), s("night-shift", "Night shift", ["Off", "Sunset to sunrise", "Custom"])]),
      ]),
    ]
  }

  var sections: [(section: String, tabs: [Tab])] = []
  var values: [String: String] = [:]
  private var initial: [String: String] = [:]
  var section = 0
  var tab = 0
  var advancedOpen = false
  private let pane = FlippedView(frame: NSRect(x: 186, y: 12, width: 502, height: 436))
  private var sectionButtons: [NSButton] = []
  private let sectionMarker = NSView()
  /// The controls this screen registered for what is shown now - replaced when the place changes.
  private var shownControls: [String] = []

  static func open(_ task: String, title: String) -> Bool {
    guard task == Self.task else { return TextEditorScreen.open(task, title: title) }
    let tree = SettingsTree()
    shared = tree
    tree.build(title: title)
    return true
  }

  private func build(title: String) {
    sections = Self.tree()
    // params.target {section, tab, key, from, label?, options?}: that key sits under Advanced on that tab, at 'from'.
    if let target = Screens.params["target"] as? [String: Any], let sectionName = target["section"] as? String, let tabName = target["tab"] as? String,
       let key = target["key"] as? String, let from = target["from"] as? String,
       let si = sections.firstIndex(where: { $0.section == sectionName }), let ti = sections[si].tabs.firstIndex(where: { $0.name == tabName }) {
      var place = sections[si].tabs[ti]
      if let existing = place.advanced.firstIndex(where: { $0.key == key }) {
        let options = place.advanced[existing].options.contains(from) ? place.advanced[existing].options : [from] + place.advanced[existing].options
        place.advanced[existing] = Setting(key: key, label: place.advanced[existing].label, options: options)
      } else {
        let given = (target["options"] as? [String]) ?? ["Off", "On", "Automatic"]
        let options = given.contains(from) ? given : [from] + given
        let label = target["label"] as? String ?? key.split(separator: "-").map { $0.capitalized }.joined(separator: " ")
        place.advanced[place.advanced.count - 1] = Setting(key: key, label: label, options: options)
      }
      sections[si].tabs[ti] = place
      values[key] = from
    }
    for entry in sections { for tab in entry.tabs { for setting in tab.basic + tab.advanced where values[setting.key] == nil { values[setting.key] = setting.options[0] } } }
    initial = values

    let fixture = Fixture.shared
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 700, height: 460))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor.white.cgColor
    let sidebar = NSView(frame: NSRect(x: 0, y: 0, width: 174, height: 460))
    sidebar.wantsLayer = true
    sidebar.layer?.backgroundColor = NSColor(calibratedWhite: 0.95, alpha: 1).cgColor
    content.addSubview(sidebar)
    let heading = Kit.label("Settings", size: 15, bold: true)
    heading.frame = NSRect(x: 16, y: 14, width: 150, height: 20)
    content.addSubview(heading)
    for (index, entry) in sections.enumerated() {
      let button = NSButton(title: entry.section, target: self, action: #selector(chooseSection(_:)))
      button.tag = index
      button.bezelStyle = .recessed
      button.setButtonType(.pushOnPushOff)
      button.alignment = .left
      button.frame = NSRect(x: 12, y: 48 + CGFloat(index) * 34, width: 150, height: 28)
      button.identifier = NSUserInterfaceItemIdentifier("section-\(entry.section)")
      fixture.controls["section-\(entry.section)"] = button
      sectionButtons.append(button)
      content.addSubview(button)
    }
    sectionMarker.wantsLayer = true
    sectionMarker.layer?.backgroundColor = NSColor.controlAccentColor.cgColor
    content.addSubview(sectionMarker)
    content.addSubview(pane)
    let save = NSButton(title: "Save", target: fixture, action: #selector(Fixture.pressed(_:)))
    save.identifier = NSUserInterfaceItemIdentifier("save")
    save.bezelStyle = .rounded
    save.keyEquivalent = "\r"
    save.frame = NSRect(x: 600, y: 420, width: 88, height: 28)
    fixture.controls["save"] = save
    content.addSubview(save)
    showPlace()
    _ = Windows.open("main", title: title, content: content)
  }

  // MARK: Places

  /// Draws the current section's tabs, the current tab's settings and, if open, its Advanced settings - and registers
  /// exactly those as targets.
  func showPlace() {
    let fixture = Fixture.shared
    for name in shownControls { fixture.controls[name] = nil }
    shownControls = []
    pane.subviews.forEach { $0.removeFromSuperview() }
    for (index, button) in sectionButtons.enumerated() { Self.mark(button, selected: index == section) }
    // A bar beside the selected section and under the selected tab: where you are reads from a screenshot.
    sectionMarker.frame = NSRect(x: 4, y: sectionButtons[section].frame.minY + 4, width: 4, height: sectionButtons[section].frame.height - 8)

    let entry = sections[section]
    let title = Kit.label(entry.section, size: 18, bold: true)
    title.frame = NSRect(x: 0, y: 2, width: 300, height: 24)
    pane.addSubview(title)
    for (index, tab) in entry.tabs.enumerated() {
      let button = NSButton(title: tab.name, target: self, action: #selector(chooseTab(_:)))
      button.tag = index
      button.bezelStyle = .rounded
      button.setButtonType(.pushOnPushOff)
      Self.mark(button, selected: index == self.tab)
      button.frame = NSRect(x: CGFloat(index) * 104, y: 36, width: 100, height: 28)
      register("tab-\(tab.name)", button)
      if index == self.tab {
        let underline = NSView(frame: NSRect(x: button.frame.minX + 8, y: button.frame.maxY + 2, width: button.frame.width - 16, height: 3))
        underline.wantsLayer = true
        underline.layer?.backgroundColor = NSColor.controlAccentColor.cgColor
        pane.addSubview(underline)
      }
    }
    let current = entry.tabs[tab]
    var y: CGFloat = 84
    for setting in current.basic {
      addRow(setting, y: y)
      y += 36
    }
    let disclosure = NSButton(title: advancedOpen ? "\u{25BE} Advanced" : "\u{25B8} Advanced", target: self, action: #selector(toggleAdvanced(_:)))
    disclosure.isBordered = false
    disclosure.font = NSFont.boldSystemFont(ofSize: 13)
    disclosure.alignment = .left
    disclosure.frame = NSRect(x: 0, y: y + 6, width: 160, height: 22)
    register("advanced", disclosure)
    y += 40
    if advancedOpen {
      for setting in current.advanced {
        addRow(setting, y: y)
        y += 36
      }
    }
  }

  /// The selected section and tab are drawn in the accent colour, so a screenshot shows where you are.
  static func mark(_ button: NSButton, selected: Bool) {
    button.state = selected ? .on : .off
    button.bezelColor = selected ? NSColor.controlAccentColor : nil
    button.contentTintColor = selected ? .white : nil
    button.font = selected ? NSFont.boldSystemFont(ofSize: 13) : NSFont.systemFont(ofSize: 13)
  }

  private func addRow(_ setting: Setting, y: CGFloat) {
    let label = Kit.label(setting.label, size: 13, bold: false)
    label.frame = NSRect(x: 0, y: y + 4, width: 200, height: 18)
    pane.addSubview(label)
    let popup = NSPopUpButton(frame: NSRect(x: 210, y: y, width: 220, height: 26), pullsDown: false)
    popup.addItems(withTitles: setting.options)
    popup.selectItem(withTitle: values[setting.key] ?? setting.options[0])
    popup.target = self
    popup.action = #selector(changed(_:))
    register(setting.key, popup)
  }

  private func register(_ name: String, _ view: NSView) {
    view.identifier = NSUserInterfaceItemIdentifier(name)
    Fixture.shared.controls[name] = view
    shownControls.append(name)
    pane.addSubview(view)
  }

  @objc func chooseSection(_ sender: NSButton) {
    if sender.tag != section { section = sender.tag; tab = 0; advancedOpen = false }
    showPlace()
  }

  @objc func chooseTab(_ sender: NSButton) {
    if sender.tag != tab { tab = sender.tag; advancedOpen = false }
    showPlace()
  }

  @objc func toggleAdvanced(_ sender: NSButton) {
    advancedOpen.toggle()
    showPlace()
  }

  /// A popup changed: recorded only when the value is new.
  @objc func changed(_ sender: NSPopUpButton) {
    guard let key = sender.identifier?.rawValue, let value = sender.titleOfSelectedItem, values[key] != value else { return }
    values[key] = value
    Fixture.shared.record("setting", ["key": key, "value": value])
  }

  static func press(_ name: String) -> Bool {
    guard Screens.current == task, let tree = shared else { return ChatThread.press(name) }
    guard name == "save" else { return false }
    let changed = tree.values.keys.sorted().filter { tree.values[$0] != tree.initial[$0] }
    Fixture.shared.record("saved", ["changed": Dictionary(uniqueKeysWithValues: changed.map { ($0, tree.values[$0] ?? "") })])
    tree.initial = tree.values
    return true
  }

  static func fields() -> [String: Any] {
    guard Screens.current == task, let tree = shared else { return [:] }
    return ["section": tree.sections[tree.section].section, "tab": tree.sections[tree.section].tabs[tree.tab].name,
            "advancedOpen": tree.advancedOpen, "values": tree.values]
  }

  /// Oracle seams: `place {section, tab, advanced}` goes there as the clicks would; popups take the generic `select`
  /// seam and Save the generic `press`.
  static func act(_ step: [String: Any]) -> Bool {
    guard Screens.current == task, let tree = shared else { return TextEditorScreen.act(step) }
    guard let place = step["place"] as? [String: Any] else { return false }
    if let name = place["section"] as? String, let index = tree.sections.firstIndex(where: { $0.section == name }), index != tree.section {
      tree.section = index; tree.tab = 0; tree.advancedOpen = false
    }
    if let name = place["tab"] as? String, let index = tree.sections[tree.section].tabs.firstIndex(where: { $0.name == name }), index != tree.tab {
      tree.tab = index; tree.advancedOpen = false
    }
    if let open = place["advanced"] as? Bool { tree.advancedOpen = open }
    tree.showPlace()
    return true
  }
}
