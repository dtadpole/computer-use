import AppKit
import WebKit

/// 'web-form' (CU-412's desktop half, helper 0.2.69): web content inside a native window - CU Fixture is no browser, so the
/// desktop route judges keys inside it - holding one form with one text field and only role=button <div> controls, no
/// submit <button>. HTML submits such a form on Return in the field (implicit submission), and the window's
/// AXDefaultButton names nothing, so Return's default can only come from the helper's DefaultCandidates read.
/// `variant` 'delete' gives one div, 'Delete account' (one candidate: the default); 'unnamed' gives two divs, 'Cancel'
/// and an icon-only div with no text and no label (a nameless candidate: unknown); 'search' gives a search field alone
/// (no candidate: Return stays free, the negative). A submit records 'web-submit' with
/// the variant only; a click on a div records 'web-click' with its id. Rects are targets 'web:<id>' as in web-buttons.
final class WebForm: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
  static let task = "web-form"
  static var shared: WebForm?
  static let variants = ["delete", "unnamed", "search"]

  static func html(variant: String) -> String {
    let controls = variant == "search" ? "" : variant == "unnamed"
      ? """
        <div role="button" tabindex="0" id="cancel" class="click" onclick="hit('cancel')">Cancel</div>
        <div role="button" tabindex="0" id="icon" class="click" onclick="hit('icon')"><svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 4h10M6 4V2h4v2M4 4l1 10h6l1-10" stroke="black" fill="none"/></svg></div>
        """
      : """
        <div role="button" tabindex="0" id="delete" class="click" onclick="hit('delete')">Delete account</div>
        """
    let ids = variant == "search" ? "['confirm']" : variant == "unnamed" ? "['confirm', 'cancel', 'icon']" : "['confirm', 'delete']"
    // 'search': a search field alone, no role=button - Return submits and the closing row shows it stays free.
    let label = variant == "search" ? "Search" : "Type DELETE to confirm"
    let inputType = variant == "search" ? "search" : "text"
    return """
      <!doctype html><html><head><meta charset="utf-8"><style>
      body { font: 15px -apple-system, sans-serif; margin: 18px; }
      .click { display: inline-block; padding: 6px 14px; margin: 10px 6px 0 0; border: 1px solid #888; border-radius: 5px; cursor: pointer; }
      input { font: 15px -apple-system, sans-serif; width: 280px; }
      </style></head><body>
      <h2>Account</h2>
      <form id="form" onsubmit="submitted(); return false">
        <label for="confirm">\(label)</label><br>
        <input id="confirm" type="\(inputType)" autocomplete="off"><br>
        \(controls)
      </form>
      <script>
      function hit(id) { window.webkit.messageHandlers.cu.postMessage({ click: id }) }
      function submitted() { window.webkit.messageHandlers.cu.postMessage({ submit: true }) }
      function rects() {
        const out = {}
        for (const id of \(ids)) { const r = document.getElementById(id).getBoundingClientRect(); out[id] = [r.left, r.top, r.width, r.height] }
        window.webkit.messageHandlers.cu.postMessage({ rects: out })
      }
      window.addEventListener('load', rects)
      </script></body></html>
      """
  }

  let web: WKWebView
  let variant: String
  var loaded = false
  var clicks: [String] = []
  var submits = 0
  var rects: [String: [Double]] = [:]

  init(variant: String) {
    self.variant = variant
    let config = WKWebViewConfiguration()
    web = WKWebView(frame: NSRect(x: 20, y: 56, width: 560, height: 300), configuration: config)
    super.init()
    config.userContentController.add(self, name: "cu")
    web.navigationDelegate = self
  }

  static func open(title: String) -> Bool {
    shared?.web.configuration.userContentController.removeScriptMessageHandler(forName: "cu")
    let given = Screens.params["variant"] as? String ?? "delete"
    let screen = WebForm(variant: variants.contains(given) ? given : "delete")
    shared = screen
    let content = FlippedView(frame: NSRect(x: 0, y: 0, width: 600, height: 380))
    let heading = Kit.label("Account (web)", size: 18, bold: true)
    heading.frame = NSRect(x: 20, y: 16, width: 400, height: 24)
    content.addSubview(heading)
    content.addSubview(screen.web)
    _ = Windows.open("main", title: title, content: content)
    screen.web.loadHTMLString(html(variant: screen.variant), baseURL: nil)
    return true
  }

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any] else { return }
    if let id = body["click"] as? String {
      clicks.append(id)
      Fixture.shared.record("web-click", ["id": id])
    }
    if body["submit"] as? Bool == true {
      submits += 1
      Fixture.shared.record("web-submit", ["variant": variant])
    }
    if let measured = body["rects"] as? [String: [Double]] {
      rects = measured
      loaded = true
    }
  }

  static func fields() -> [String: Any] {
    guard Screens.current == task, let screen = shared else { return [:] }
    return ["webFormLoaded": screen.loaded, "webFormVariant": screen.variant, "webFormSubmits": screen.submits, "webFormClicks": screen.clicks]
  }

  /// Targets 'web:<id>' in the window's content coordinates, as WebButtons.targets reports them.
  static func targets() -> [String: Any] {
    guard Screens.current == task, let screen = shared, let window = screen.web.window, let content = window.contentView else { return [:] }
    let frame = screen.web.convert(screen.web.bounds, to: content)
    let top = content.isFlipped ? frame.minY : content.bounds.height - frame.maxY
    var out: [String: Any] = [:]
    for (id, r) in screen.rects where r.count == 4 {
      let x = frame.minX + r[0], y = top + r[1]
      out["web:\(id)"] = ["window": window.identifier?.rawValue ?? "", "x": x, "y": y, "width": r[2], "height": r[3], "cx": x + r[2] / 2, "cy": y + r[3] / 2, "type": "web"]
    }
    return out
  }

  /// Seam: `webFormSubmit true` submits the form as Return in its field would (implicit submission), for the oracle.
  static func act(_ step: [String: Any]) -> Bool {
    guard Screens.current == task, let screen = shared, step["webFormSubmit"] as? Bool == true else { return false }
    screen.web.evaluateJavaScript("document.getElementById('form').requestSubmit()", completionHandler: nil)
    return true
  }
}
