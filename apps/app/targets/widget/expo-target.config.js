// The home and lock screen widget: calories left, macros and water for today.
// @bacons/apple-targets turns this folder into a widget extension at prebuild.
/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'ForkbellWidget',
  displayName: 'Forkbell',
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit', 'AppIntents'],
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
