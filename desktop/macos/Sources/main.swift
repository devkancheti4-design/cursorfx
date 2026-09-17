// CursorFX Desktop for macOS: a click-through overlay on every screen that renders the CursorFX
// plugins over the whole system (desktop, every app), driven by the global mouse position.
import Cocoa
import WebKit
import SwiftUI

// Private window-server calls that let a background app hide the system cursor (used by cursor-hiding utilities).
@_silgen_name("_CGSDefaultConnection") func _CGSDefaultConnection() -> Int32
@_silgen_name("CGSSetConnectionProperty") func CGSSetConnectionProperty(_ cid: Int32, _ ownerCid: Int32, _ key: CFString, _ value: CFTypeRef) -> Int32
@_silgen_name("CGCursorIsVisible") func cgCursorIsVisible() -> UInt32

final class CursorHider {
    private var hideCount = 0
    var wanted = false
    init() {
        let cid = _CGSDefaultConnection()
        _ = CGSSetConnectionProperty(cid, cid, "SetsCursorInBackground" as CFString, kCFBooleanTrue)
    }
    func hide() { _ = CGDisplayHideCursor(CGMainDisplayID()); hideCount += 1 }
    func show() { while hideCount > 0 { _ = CGDisplayShowCursor(CGMainDisplayID()); hideCount -= 1 } }
    // Some apps re-show the cursor when they change it; call this often to keep it hidden.
    func reassert() { if wanted && cgCursorIsVisible() != 0 { hide() } }
}

let logURL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/CursorFX.log")
func log(_ s: String) {
    let line = "[\(ISO8601DateFormatter().string(from: Date()))] \(s)\n"
    if let h = try? FileHandle(forWritingTo: logURL) {
        h.seekToEndOfFile(); h.write(line.data(using: .utf8)!); h.closeFile()
    } else {
        try? line.write(to: logURL, atomically: true, encoding: .utf8)
    }
}

final class OverlayWindow: NSWindow {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

final class Overlay: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    let screen: NSScreen
    let window: OverlayWindow
    let web: WKWebView
    var ready = false
    var onReady: (() -> Void)?

    init(screen: NSScreen, resources: URL) {
        self.screen = screen
        let frame = screen.frame
        window = OverlayWindow(contentRect: frame, styleMask: [.borderless], backing: .buffered, defer: false, screen: screen)
        window.isOpaque = false
        window.backgroundColor = .clear
        window.hasShadow = false
        window.ignoresMouseEvents = true
        window.level = .screenSaver
        window.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        window.isReleasedWhenClosed = false

        let config = WKWebViewConfiguration()
        config.mediaTypesRequiringUserActionForPlayback = []
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        let ucc = WKUserContentController()
        config.userContentController = ucc
        web = WKWebView(frame: NSRect(origin: .zero, size: frame.size), configuration: config)
        web.setValue(false, forKey: "drawsBackground")
        if #available(macOS 12.0, *) { web.underPageBackgroundColor = .clear }
        web.autoresizingMask = [.width, .height]
        super.init()
        ucc.add(self, name: "native")
        web.navigationDelegate = self
        window.contentView = web
        web.loadFileURL(resources.appendingPathComponent("overlay.html"), allowingReadAccessTo: resources)
        window.orderFrontRegardless()
    }

    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        let body = "\(m.body)"
        log("js[\(Int(screen.frame.width))x\(Int(screen.frame.height))]: \(body)")
        if body.hasPrefix("ready") { ready = true; onReady?() }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { log("nav fail: \(error)") }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { log("nav provisional fail: \(error)") }

    func send(_ js: String) {
        guard ready else { return }
        web.evaluateJavaScript(js) { _, err in if let err = err { log("js error: \(err.localizedDescription)") } }
    }
    func close() { window.orderOut(nil); window.close() }
}

struct PluginItem: Identifiable, Hashable {
    let name: String, label: String, icon: String
    var id: String { name }
}

final class Model: ObservableObject {
    @Published var enabled = true { didSet { changed() } }
    @Published var sound = true { didSet { changed() } }
    @Published var scale = 0.5 { didSet { changed() } }
    @Published var cursor = "f1car" { didSet { changed() } }
    @Published var trail = "" { didSet { changed() } }
    @Published var click = "gunshot" { didSet { changed() } }
    @Published var hideCursor = true { didSet { changed() } }
    @Published var lists: [String: [PluginItem]] = [:]
    var suppress = false
    var onChange: (() -> Void)?
    func changed() { if !suppress { onChange?() } }
    func selected(_ kind: String) -> String { kind == "cursor" ? cursor : kind == "trail" ? trail : click }
    func select(_ kind: String, _ name: String) {
        switch kind { case "cursor": cursor = name; case "trail": trail = name; default: click = name }
    }
}

struct Chip: View {
    let icon: String, label: String, selected: Bool, action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(spacing: 3) {
                Text(icon).font(.system(size: 20))
                Text(label).font(.system(size: 9, weight: .medium)).lineLimit(1).truncationMode(.tail)
            }
            .frame(width: 58, height: 50)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(selected ? Color.accentColor.opacity(0.9) : Color.primary.opacity(0.08)))
            .foregroundStyle(selected ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
    }
}

struct WidgetView: View {
    @ObservedObject var model: Model
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("🏎️ CursorFX").font(.system(size: 15, weight: .semibold))
                Spacer()
                Toggle("", isOn: $model.enabled).toggleStyle(.switch).labelsHidden()
            }
            Group {
                strip("Cursor", kind: "cursor")
                strip("Trail", kind: "trail")
                strip("Click", kind: "click")
            }
            .opacity(model.enabled ? 1 : 0.4)
            .disabled(!model.enabled)
            HStack(spacing: 8) {
                Image(systemName: "cursorarrow").font(.system(size: 11)).foregroundStyle(.secondary)
                Slider(value: $model.scale, in: 0.25...1.25)
                Image(systemName: "cursorarrow").font(.system(size: 18)).foregroundStyle(.secondary)
            }
            .opacity(model.enabled ? 1 : 0.4)
            .disabled(!model.enabled)
            HStack {
                Toggle("Sound", isOn: $model.sound).toggleStyle(.switch).font(.system(size: 12))
                Toggle("Hide arrow", isOn: $model.hideCursor).toggleStyle(.switch).font(.system(size: 12))
                Spacer()
                Button("Quit") { NSApp.terminate(nil) }.font(.system(size: 11)).buttonStyle(.plain).foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .frame(width: 330)
    }

    func strip(_ title: String, kind: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title.uppercased()).font(.system(size: 10, weight: .semibold)).foregroundStyle(.secondary).kerning(1)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 7) {
                    Chip(icon: "∅", label: "Off", selected: model.selected(kind).isEmpty) { model.select(kind, "") }
                    ForEach(model.lists[kind] ?? []) { item in
                        Chip(icon: item.icon, label: item.label, selected: model.selected(kind) == item.name) { model.select(kind, item.name) }
                    }
                }
                .padding(.horizontal, 1)
            }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    var overlays: [Overlay] = []
    var current: Overlay?
    var statusItem: NSStatusItem!
    var popover: NSPopover!
    var timer: Timer?
    var lastDown = false
    var lastX = -1.0, lastY = -1.0
    let model = Model()
    let hider = CursorHider()
    let defaults = UserDefaults.standard
    var reassertTick = 0

    var resources: URL { Bundle.main.resourceURL ?? URL(fileURLWithPath: ".") }

    func applicationDidFinishLaunching(_ n: Notification) {
        NSApp.setActivationPolicy(.accessory)
        log("launch; resources=\(resources.path)")
        loadSettings()
        model.onChange = { [weak self] in self?.apply() }
        buildOverlays()
        buildStatusItem()
        let t = Timer(timeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in self?.tick() }
        RunLoop.main.add(t, forMode: .common)
        timer = t
        NotificationCenter.default.addObserver(forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main) { [weak self] _ in self?.buildOverlays() }
        applyCursorVisibility()
        log("cursor hidden: \(model.hideCursor && model.enabled), visible now: \(cgCursorIsVisible())")
        if ProcessInfo.processInfo.environment["CURSORFX_SHOW_WIDGET"] != nil {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in self?.togglePopover() }
        }
    }

    func applicationWillTerminate(_ n: Notification) {
        hider.wanted = false
        hider.show()
    }

    func loadSettings() {
        model.suppress = true
        if let raw = defaults.string(forKey: "config"), let d = raw.data(using: .utf8),
           let c = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
            model.cursor = c["cursor"] as? String ?? ""
            model.trail = c["trail"] as? String ?? ""
            model.click = c["click"] as? String ?? ""
            model.sound = c["sound"] as? Bool ?? true
            model.scale = (c["cursorScale"] as? NSNumber)?.doubleValue ?? 0.5
            model.enabled = c["enabled"] as? Bool ?? true
        }
        model.hideCursor = defaults.object(forKey: "hideCursor") == nil ? true : defaults.bool(forKey: "hideCursor")
        model.suppress = false
    }

    func configJSON() -> String {
        let c: [String: Any] = [
            "cursor": model.cursor.isEmpty ? NSNull() : model.cursor,
            "trail": model.trail.isEmpty ? NSNull() : model.trail,
            "click": model.click.isEmpty ? NSNull() : model.click,
            "sound": model.sound, "cursorScale": model.scale, "enabled": model.enabled,
        ]
        let d = try? JSONSerialization.data(withJSONObject: c)
        return String(data: d ?? Data("{}".utf8), encoding: .utf8) ?? "{}"
    }

    func buildOverlays() {
        overlays.forEach { $0.close() }
        overlays = NSScreen.screens.map { screen in
            let ov = Overlay(screen: screen, resources: resources)
            ov.onReady = { [weak self, weak ov] in
                guard let self = self, let ov = ov else { return }
                ov.send("__native.set(\(self.configJSON()))")
                if self.model.lists.isEmpty { self.fetchLists(from: ov) }
            }
            return ov
        }
        current = nil
        if !model.enabled { overlays.forEach { $0.window.orderOut(nil) } }
        log("overlays: \(overlays.count)")
    }

    func fetchLists(from ov: Overlay) {
        ov.web.evaluateJavaScript("__native.lists()") { [weak self] result, err in
            guard let self = self, let s = result as? String, let d = s.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: d) as? [String: [[String: Any]]] else {
                log("lists failed: \(String(describing: err))"); return
            }
            var lists: [String: [PluginItem]] = [:]
            for (kind, items) in obj {
                lists[kind] = items.map { PluginItem(name: $0["name"] as? String ?? "", label: $0["label"] as? String ?? "", icon: $0["icon"] as? String ?? "") }
            }
            self.model.lists = lists
            log("lists: cursor=\(lists["cursor"]?.count ?? 0) trail=\(lists["trail"]?.count ?? 0) click=\(lists["click"]?.count ?? 0)")
        }
    }

    func tick() {
        guard model.enabled else { return }
        reassertTick += 1
        if reassertTick % 30 == 0 { hider.reassert() }
        let loc = NSEvent.mouseLocation
        guard let ov = overlays.first(where: { NSMouseInRect(loc, $0.screen.frame, false) }) ?? overlays.first else { return }
        if ov !== current { current?.send("__native.leave()"); current = ov }
        let f = ov.screen.frame
        let x = loc.x - f.minX, y = f.maxY - loc.y
        let down = (NSEvent.pressedMouseButtons & 1) != 0
        var js = ""
        if x != lastX || y != lastY { js += "__native.move(\(x),\(y));"; lastX = x; lastY = y }
        if down != lastDown { js += down ? "__native.down(\(x),\(y));" : "__native.up(\(x),\(y));"; lastDown = down }
        if !js.isEmpty { ov.send(js) }
    }

    func buildStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "🏎️"
        statusItem.button?.target = self
        statusItem.button?.action = #selector(togglePopover)
        popover = NSPopover()
        popover.behavior = .transient
        popover.contentSize = NSSize(width: 330, height: 400)
        popover.contentViewController = NSHostingController(rootView: WidgetView(model: model))
    }

    @objc func togglePopover() {
        guard let button = statusItem.button else { return }
        if popover.isShown { popover.performClose(nil); return }
        NSApp.activate(ignoringOtherApps: true)
        popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
    }

    func applyCursorVisibility() {
        let hide = model.hideCursor && model.enabled
        hider.wanted = hide
        if hide { hider.hide() } else { hider.show() }
        defaults.set(model.hideCursor, forKey: "hideCursor")
    }

    func apply() {
        defaults.set(configJSON(), forKey: "config")
        overlays.forEach { ov in
            if model.enabled { ov.window.orderFrontRegardless() } else { ov.window.orderOut(nil) }
            ov.send("__native.set(\(configJSON()))")
        }
        applyCursorVisibility()
        log("apply \(configJSON())")
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
