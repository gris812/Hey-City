// Load .env so EXPO_PUBLIC_* are available (app.config runs in Node)
require('dotenv').config({ path: '.env' });

module.exports = {
  expo: {
    name: 'Hey City',
    slug: 'hey-city',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    extra: {
      buildGitSha: process.env.EAS_BUILD_GIT_COMMIT_HASH || process.env.EXPO_PUBLIC_GIT_SHA || 'local_unstamped_build',
      eas: {
        projectId: '554718b7-7f37-4cbb-89d0-cec6fe193fb5',
      },
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.sunshine.aiguide',
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY || '',
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription: 'Нужна для рассказов о местах по пути.',
        NSLocationAlwaysAndWhenInUseUsageDescription: 'Для режима в авто при поездке.',
        NSMicrophoneUsageDescription: 'Нужен для разговора с гидом во время прогулки или поездки.',
      },
    },
    android: {
      package: 'com.sunshine.aiguide',
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || '',
        },
      },
      permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'RECORD_AUDIO'],
    },
    plugins: [
      'expo-asset',
      'expo-location',
      'expo-secure-store',
      '@config-plugins/react-native-webrtc',
      '@siteed/audio-studio',
      'react-native-audio-api'
    ]
  },
};
