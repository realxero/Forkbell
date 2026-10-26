Pod::Spec.new do |s|
  s.name           = 'ForkbellDepth'
  s.version        = '1.0.0'
  s.summary        = 'The LiDAR camera for measuring a plate in Forkbell'
  s.description    = 'Takes one photo and the LiDAR depth map that lines up with it, with the camera intrinsics.'
  s.license        = { :type => 'PolyForm-Noncommercial-1.0.0' }
  s.author         = 'realxero'
  s.homepage       = 'https://github.com/realxero/Forkbell'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: 'https://github.com/realxero/Forkbell.git' }
  s.static_framework = true
  s.swift_version  = '5.9'
  s.dependency 'ExpoModulesCore'
  s.frameworks     = 'ARKit', 'SceneKit', 'CoreImage'
  s.source_files   = '**/*.swift'
end
