// Load .env so EXPO_PUBLIC_* are available (app.config runs in Node)
require('dotenv').config({ path: '.env' });

module.exports = {
  expo: {
    name: 'Sunshine AI Guide',
    slug: 'sunshine-ai-guide',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.sunshine.aiguide',
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY || '',
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription: 'Нужна для рассказов о местах по пути.',
        NSLocationAlwaysAndWhenInUseUsageDescription: 'Для режима в авто при поездке.',
      },
    },
    android: {
      package: 'com.sunshine.aiguide',
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || '',
        },
      },
      permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
    },
    plugins: [
      'expo-asset',
      'expo-location',
      'expo-secure-store'
    ]
  },
};
