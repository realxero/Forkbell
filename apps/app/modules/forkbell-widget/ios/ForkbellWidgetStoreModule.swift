// Today's snapshot for the widget, written to the App Group this install really
// has. Re-signing with SideStore or AltStore renames the group (it adds the
// signer's team) and lists the new name under ALTAppGroups in Info.plist, so
// the fixed name from the build points at nothing and the widget waits forever.
// The widget (targets/widget/ForkbellWidget.swift) looks the group up the same way.
import ExpoModulesCore
import WidgetKit

private let builtGroup = "group.com.realxero.forkbell"

func forkbellGroup() -> String? {
  var names = (Bundle.main.object(forInfoDictionaryKey: "ALTAppGroups") as? [String]) ?? []
  names.append(builtGroup)
  if let id = Bundle.main.bundleIdentifier { names.append("group.\(id)") }
  // Certificate signers (FlareStore, ESign…) may rename the group without saying so: its real name is in the profile.
  names += (profileEntitlements()?["com.apple.security.application-groups"] as? [String]) ?? []
  return names.first { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0) != nil }
}

/// The embedded provisioning profile's entitlements (a signed plist; the XML sits inside it as text).
func profileEntitlements() -> [String: Any]? {
  guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
        let raw = try? Data(contentsOf: url),
        let text = String(data: raw, encoding: .isoLatin1),
        let start = text.range(of: "<?xml"), let end = text.range(of: "</plist>"),
        let xml = text[start.lowerBound..<end.upperBound].data(using: .isoLatin1),
        let plist = try? PropertyListSerialization.propertyList(from: xml, format: nil) as? [String: Any],
        let ents = plist["Entitlements"] as? [String: Any] else { return nil }
  return ents
}

public class ForkbellWidgetStoreModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ForkbellWidgetStore")

    /// For Settings: the group in use (or nil), and the App Groups this install's signature allows,
    /// read from its provisioning profile (nil when there's no profile to read).
    Function("status") { () -> String in
      let info: [String: Any] = [
        "group": forkbellGroup() ?? NSNull(),
        "allowed": profileEntitlements().map { $0["com.apple.security.application-groups"] as? [String] ?? [] } ?? NSNull(),
        // Certificate signers (FlareStore and the like) usually allow no App Group; a shared keychain is the other way to the widget.
        "keychain": profileEntitlements().map { $0["keychain-access-groups"] as? [String] ?? [] } ?? NSNull(),
        "bundle": Bundle.main.bundleIdentifier ?? NSNull(),
      ]
      let data = (try? JSONSerialization.data(withJSONObject: info)) ?? Data("{}".utf8)
      return String(data: data, encoding: .utf8) ?? "{}"
    }

    /// Saves the value and redraws the widget; returns the group used, or nil when the install has none.
    Function("write") { (key: String, value: String) -> String? in
      guard let group = forkbellGroup(), let store = UserDefaults(suiteName: group) else { return nil }
      store.set(value, forKey: key)
      WidgetCenter.shared.reloadAllTimelines()
      return group
    }
  }
}
