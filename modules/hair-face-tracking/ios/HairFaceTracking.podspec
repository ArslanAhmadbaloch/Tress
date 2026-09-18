require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'HairFaceTracking'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'MIT'
  s.author         = 'Tress'
  s.homepage       = 'https://tress.app'
  s.platforms      = {
    :ios => '16.4'
  }
  s.swift_version  = '5.9'
  # A local module: CocoaPods resolves it by path, so the source is a
  # placeholder that only has to be well-formed.
  s.source         = { git: 'https://tress.app/hair-face-tracking.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # ARKit and SceneKit are iOS system frameworks; ARFaceTrackingConfiguration
  # is guarded at runtime with `isSupported`, so a device without a TrueDepth
  # camera links fine and simply reports the feature as unavailable.
  s.frameworks = 'ARKit', 'SceneKit', 'CoreImage'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
