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
  return names.first { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: $0) != nil }
}

public class ForkbellWidgetModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ForkbellWidget")

    /// Saves the value and redraws the widget; returns the group used, or nil when the install has none.
    Function("write") { (key: String, value: String) -> String? in
      guard let group = forkbellGroup(), let store = UserDefaults(suiteName: group) else { return nil }
      store.set(value, forKey: key)
      WidgetCenter.shared.reloadAllTimelines()
      return group
    }
  }
}
