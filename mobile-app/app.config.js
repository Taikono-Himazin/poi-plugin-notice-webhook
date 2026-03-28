const { version } = require('../version.json');

module.exports = {
  expo: {
    name: 'poi通知転送',
    slug: 'poi-notice',
    version,
    scheme: 'poi-notice',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'dark',
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.github.taikonohimazin.poinotice',
      infoPlist: {
        UIBackgroundModes: ['fetch', 'remote-notification'],
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#1a1a2e',
      },
      package: 'com.github.taikonohimazin.poinotice',
    },
    plugins: [
      'expo-background-task',
      ['expo-notifications', { color: '#5865f2' }],
    ],
    extra: {
      eas: {
        projectId: 'f7f74146-d99d-482f-a190-d3c78926c6eb',
      },
    },
  },
};
