// Today at a glance: calories left, protein, carbs, fat and water.
// With a server address and a Shortcut key set in Edit Widget, it fetches
// today from the server itself (/api/shortcuts/today) about every 20 minutes,
// so it stays current without opening the app and whatever the signing allows.
// Otherwise it reads the snapshot the app writes to the shared App Group
// (lib/widget.ios.ts). A snapshot from another day shows as a fresh day.
import AppIntents
import SwiftUI
import WidgetKit

private let builtGroup = "group.com.realxero.forkbell"

// The App Group this install really has. SideStore and AltStore rename it when
// they re-sign (adding the signer's team) and list the new name under
// ALTAppGroups in the app's Info.plist; the app writes to the same one
// (modules/forkbell-widget).
private let group: String = {
  let app = Bundle.main.bundleURL.pathExtension == "appex"
    ? Bundle(url: Bundle.main.bundleURL.deletingLastPathComponent().deletingLastPathComponent())
    : Bundle.main
  var names: [String] = []
  for b in [Bundle.main, app].compactMap({ $0 }) {
    names += (b.object(forInfoDictionaryKey: "ALTAppGroups") as? [String]) ?? []
  }
  names.append(builtGroup)
  if let id = app?.bundleIdentifier { names.append("group.\(id)") }
  // Certificate signers (FlareStore, ESign…) may rename the group without saying so: its real name is in the profiles.
  for b in [Bundle.main, app].compactMap({ $0 }) { names += profileGroups(b) }
  return names.first { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0) != nil } ?? builtGroup
}()

/// The App Groups in a bundle's embedded provisioning profile (a signed plist with the XML inside it as text).
private func profileGroups(_ b: Bundle) -> [String] {
  guard let url = b.url(forResource: "embedded", withExtension: "mobileprovision"),
        let raw = try? Data(contentsOf: url),
        let text = String(data: raw, encoding: .isoLatin1),
        let start = text.range(of: "<?xml"), let end = text.range(of: "</plist>"),
        let xml = text[start.lowerBound..<end.upperBound].data(using: .isoLatin1),
        let plist = try? PropertyListSerialization.propertyList(from: xml, format: nil) as? [String: Any],
        let ents = plist["Entitlements"] as? [String: Any] else { return [] }
  return ents["com.apple.security.application-groups"] as? [String] ?? []
}

struct Today: Codable {
  var date: String
  var kcalGoal: Double?
  var kcalEaten: Double
  var protein: Double
  var proteinGoal: Double?
  var carbs: Double
  var carbsGoal: Double?
  var fat: Double
  var fatGoal: Double?
  var waterMl: Double?
  var waterGoalMl: Double?
  var netCarbs: Bool?
  /// The app has changes the server hasn't got yet (logged offline, or still sending).
  var pending: Bool?
}

private func todayString(_ d: Date = Date()) -> String {
  let f = DateFormatter()
  f.calendar = Calendar(identifier: .gregorian)
  f.dateFormat = "yyyy-MM-dd"
  return f.string(from: d)
}

private func load() -> Today? {
  guard let raw = UserDefaults(suiteName: group)?.string(forKey: "today"), let data = raw.data(using: .utf8),
        var t = try? JSONDecoder().decode(Today.self, from: data) else { return nil }
  if t.date != todayString() {
    // Yesterday's numbers: keep the goals, start the day at zero.
    t = Today(date: todayString(), kcalGoal: t.kcalGoal, kcalEaten: 0, protein: 0, proteinGoal: t.proteinGoal, carbs: 0, carbsGoal: t.carbsGoal, fat: 0, fatGoal: t.fatGoal, waterMl: 0, waterGoalMl: t.waterGoalMl, netCarbs: t.netCarbs)
  }
  return t
}

/// Edit Widget: where to fetch today from. A Shortcut key only reads and asks; it can't log anything by itself.
struct TodayConfig: WidgetConfigurationIntent {
  static var title: LocalizedStringResource = "Forkbell"
  static var description = IntentDescription("Add your server and a Shortcut key (Forkbell › Settings › Shortcuts) so the widget updates on its own.")
  @Parameter(title: "Server address") var server: String?
  @Parameter(title: "Shortcut key") var key: String?

  var connected: Bool { !(server ?? "").isEmpty && !(key ?? "").isEmpty }
}

/// The app's own numbers while it has changes still to send (the server's would be missing them), else the server's.
private func current(_ c: TodayConfig) async -> Today? {
  if let mine = load(), mine.pending == true { return mine }
  return await fetchToday(c) ?? load()
}

/// Today from the server, in the same shape the app writes; nil when not set up or unreachable.
private func fetchToday(_ c: TodayConfig) async -> Today? {
  guard c.connected, var base = c.server?.trimmingCharacters(in: .whitespacesAndNewlines),
        let key = c.key?.trimmingCharacters(in: .whitespacesAndNewlines) else { return nil }
  if !base.contains("://") { base = "https://" + base }
  while base.hasSuffix("/") { base.removeLast() }
  guard let url = URL(string: "\(base)/api/shortcuts/today?today=\(todayString())") else { return nil }
  var req = URLRequest(url: url, timeoutInterval: 15)
  req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
  struct Reply: Decodable { let widget: Today? }
  guard let got = try? await URLSession.shared.data(for: req), (got.1 as? HTTPURLResponse)?.statusCode == 200 else { return nil }
  return (try? JSONDecoder().decode(Reply.self, from: got.0))?.widget
}

struct Entry: TimelineEntry {
  let date: Date
  let today: Today?
  var connected = false
}

struct Provider: AppIntentTimelineProvider {
  func placeholder(in context: Context) -> Entry {
    Entry(date: Date(), today: Today(date: todayString(), kcalGoal: 2200, kcalEaten: 1340, protein: 92, proteinGoal: 150, carbs: 160, carbsGoal: 220, fat: 48, fatGoal: 75, waterMl: 1250, waterGoalMl: 2000, netCarbs: false))
  }
  func snapshot(for c: TodayConfig, in context: Context) async -> Entry {
    if context.isPreview { return placeholder(in: context) }
    return Entry(date: Date(), today: await current(c), connected: c.connected)
  }
  func timeline(for c: TodayConfig, in context: Context) async -> Timeline<Entry> {
    let today = await current(c)
    // Connected: check again in 20 minutes (well inside WidgetKit's daily budget).
    // Not: the app reloads it when you log. Either way midnight starts a fresh day.
    let midnight = Calendar.current.startOfDay(for: Date().addingTimeInterval(86_400))
    let next = c.connected ? min(Date().addingTimeInterval(20 * 60), midnight) : midnight
    return Timeline(entries: [Entry(date: Date(), today: today, connected: c.connected)], policy: .after(next))
  }
}

private let proteinTint = Color(red: 0.23, green: 0.51, blue: 0.96)
private let carbsTint = Color(red: 0.92, green: 0.70, blue: 0.10)
private let fatTint = Color(red: 0.20, green: 0.68, blue: 0.40)
private let overTint = Color(red: 0.86, green: 0.25, blue: 0.22)

private func whole(_ v: Double) -> String { NumberFormatter.localizedString(from: NSNumber(value: Int(v.rounded())), number: .decimal) }

/** "1,240 left", "120 over", or what you've eaten when there's no goal. */
private func kcalLine(_ t: Today) -> (number: String, label: String, over: Bool) {
  guard let goal = t.kcalGoal, goal > 0 else { return (whole(t.kcalEaten), "kcal eaten", false) }
  let left = goal - t.kcalEaten
  return left >= 0 ? (whole(left), "kcal left", false) : (whole(-left), "kcal over", true)
}

struct Ring: View {
  let fraction: Double
  let tint: Color
  var width: CGFloat = 8
  var body: some View {
    ZStack {
      Circle().stroke(tint.opacity(0.2), lineWidth: width)
      Circle().trim(from: 0, to: min(max(fraction, 0), 1)).stroke(tint, style: StrokeStyle(lineWidth: width, lineCap: .round)).rotationEffect(.degrees(-90))
    }
  }
}

struct MacroRow: View {
  let label: String
  let value: Double
  let goal: Double?
  let tint: Color
  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      HStack {
        Text(label).font(.caption2).foregroundStyle(.secondary)
        Spacer()
        Text(goal.map { "\(whole(value))/\(whole($0)) g" } ?? "\(whole(value)) g").font(.caption2.monospacedDigit())
      }
      if let goal, goal > 0 {
        GeometryReader { g in
          ZStack(alignment: .leading) {
            Capsule().fill(tint.opacity(0.2))
            Capsule().fill(value > goal ? overTint : tint).frame(width: g.size.width * min(value / goal, 1))
          }
        }.frame(height: 4)
      }
    }
    .accessibilityElement(children: .combine)
  }
}

struct WidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: Entry

  var body: some View {
    if let t = entry.today {
      content(t)
    } else {
      Text(entry.connected ? "Can’t reach your server right now." : "Hold here, tap Edit Widget, and add your server and a Shortcut key.")
        .font(.caption).multilineTextAlignment(.center)
    }
  }

  @ViewBuilder func content(_ t: Today) -> some View {
    let k = kcalLine(t)
    let fraction = (t.kcalGoal ?? 0) > 0 ? t.kcalEaten / t.kcalGoal! : 0
    switch family {
    case .accessoryCircular:
      Gauge(value: min(fraction, 1)) { Text("kcal") } currentValueLabel: { Text(k.number).font(.system(size: 12).monospacedDigit()) }
        .gaugeStyle(.accessoryCircularCapacity)
        .accessibilityLabel("\(k.number) \(k.label)")
    case .accessoryRectangular:
      VStack(alignment: .leading, spacing: 1) {
        Text("\(k.number) \(k.label)").font(.headline.monospacedDigit())
        Text("P \(whole(t.protein)) · \(t.netCarbs == true ? "Net C" : "C") \(whole(t.carbs)) · F \(whole(t.fat))").font(.caption.monospacedDigit())
      }
    case .accessoryInline:
      Text("\(k.number) \(k.label)")
    case .systemSmall:
      VStack(spacing: 6) {
        ZStack {
          Ring(fraction: fraction, tint: k.over ? overTint : .primary)
          VStack(spacing: 0) {
            Text(k.number).font(.title3.bold().monospacedDigit()).minimumScaleFactor(0.6)
            Text(k.label).font(.caption2).foregroundStyle(.secondary)
          }
        }
        Text("Protein \(whole(t.protein))\(t.proteinGoal.map { "/\(whole($0))" } ?? "") g").font(.caption2.monospacedDigit()).foregroundStyle(proteinTint)
      }
      .accessibilityElement(children: .combine)
    default:
      HStack(spacing: 14) {
        ZStack {
          Ring(fraction: fraction, tint: k.over ? overTint : .primary, width: 10)
          VStack(spacing: 0) {
            Text(k.number).font(.title2.bold().monospacedDigit()).minimumScaleFactor(0.6)
            Text(k.label).font(.caption2).foregroundStyle(.secondary)
          }
        }
        .frame(width: 110)
        .accessibilityElement(children: .combine)
        VStack(alignment: .leading, spacing: 6) {
          MacroRow(label: "Protein", value: t.protein, goal: t.proteinGoal, tint: proteinTint)
          MacroRow(label: t.netCarbs == true ? "Net carbs" : "Carbs", value: t.carbs, goal: t.carbsGoal, tint: carbsTint)
          MacroRow(label: "Fat", value: t.fat, goal: t.fatGoal, tint: fatTint)
          if let water = t.waterMl, let goal = t.waterGoalMl, goal > 0 {
            Text("Water \(String(format: "%.1f", water / 1000)) of \(String(format: "%.1f", goal / 1000)) L").font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
          }
        }
      }
    }
  }
}

@main
struct ForkbellWidgetBundle: WidgetBundle {
  var body: some Widget { TodayWidget() }
}

struct TodayWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(kind: "today", intent: TodayConfig.self, provider: Provider()) { entry in
      WidgetView(entry: entry).containerBackground(.fill.tertiary, for: .widget)
    }
    .configurationDisplayName("Today")
    .description("Calories left, macros and water.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
  }
}
