Pod::Spec.new do |s|
  s.name           = 'ItemClassifier'
  s.version        = '1.0.0'
  s.summary        = 'CoreML item classifier for Mewgenics'
  s.description    = 'Expo module that runs CoreML inference to identify game items'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.0' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
