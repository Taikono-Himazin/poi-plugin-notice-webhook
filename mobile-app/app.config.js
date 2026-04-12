const { version } = require('../version.json');

module.exports = {
  expo: {
    name: 'poi通知転送',
    slug: 'poi-notice',
    version,
    updates: {
      url: 'https://u.expo.dev/f7f74146-d99d-482f-a190-d3c78926c6eb',
    },
    runtimeVersion: { policy: 'appVersion' },
    scheme: 'poi-notice',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'dark',
    splash: {
      backgroundColor: '#0f0f1a',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.github.taikonohimazin.poinotice',
      icon: {
        light: './assets/icon.png',
        dark: './assets/icon-dark.png',
      },
      usesAppleSignIn: true,
      infoPlist: {
        UIBackgroundModes: ['fetch', 'remote-notification'],
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        monochromeImage: './assets/adaptive-icon-monochrome.png',
        backgroundColor: '#1a1a2e',
      },
      package: 'com.github.taikonohimazin.poinotice',
      googleServicesFile: './google-services.json',
    },
    plugins: [
      'expo-apple-authentication',
      'expo-background-task',
      ['expo-notifications', { color: '#5865f2' }],
      [
        'expo-build-properties',
        {
          ios: {
            deploymentTarget: '17.0',
            extraPodfileProperties: {
              CODE_SIGNING_ALLOWED: 'NO',
            },
          },
        },
      ],
      './plugins/withWidget',
    ],
    extra: {
      eas: {
        projectId: 'f7f74146-d99d-482f-a190-d3c78926c6eb',
        build: {
          experimental: {
            ios: {
              appExtensions: [
                {
                  targetName: 'PoiNoticeWidgetExtension',
                  bundleIdentifier: 'com.github.taikonohimazin.poinotice.widget',
                  entitlements: {
                    'com.apple.security.application-groups': ['group.com.github.taikonohimazin.poinotice'],
                  },
                },
              ],
            },
          },
        },
      },
    },
  },
};
