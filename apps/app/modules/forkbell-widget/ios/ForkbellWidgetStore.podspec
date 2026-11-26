# Named ForkbellWidgetStore, not ForkbellWidget: that name is the widget extension's own module, and the clash broke the iOS build.
Pod::Spec.new do |s|
  s.name           = 'ForkbellWidgetStore'
  s.version        = '1.0.0'
  s.summary        = 'Writes today\'s snapshot for the Forkbell home screen widget'
  s.description    = 'Finds the App Group the installed app really has (sideloaders rename it when they re-sign) and writes the widget snapshot there.'
  s.license        = { :type => 'PolyForm-Noncommercial-1.0.0' }
  s.author         = 'realxero'
  s.homepage       = 'https://github.com/realxero/Forkbell'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: 'https://github.com/realxero/Forkbell.git' }
  s.static_framework = true
  s.swift_version  = '5.9'
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'WidgetKit'
  s.source_files   = '**/*.swift'
end
