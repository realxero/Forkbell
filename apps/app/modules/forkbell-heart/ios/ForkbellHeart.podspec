Pod::Spec.new do |s|
  s.name           = 'ForkbellHeart'
  s.version        = '1.0.0'
  s.summary        = 'Live heart rate from a Bluetooth heart-rate sensor (a watch broadcasting, or a strap) in Forkbell'
  s.description    = 'Finds and connects to devices offering the standard Bluetooth Heart Rate service and passes each reading to JavaScript.'
  s.license        = { :type => 'PolyForm-Noncommercial-1.0.0' }
  s.author         = 'realxero'
  s.homepage       = 'https://github.com/realxero/Forkbell'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: 'https://github.com/realxero/Forkbell.git' }
  s.static_framework = true
  s.swift_version  = '5.9'
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'CoreBluetooth'
  s.source_files   = '**/*.swift'
end
