/**
 * Expo Config Plugin: iOS Widget Extension (PoiNoticeWidget)
 *
 * - Adds App Groups entitlement to the main app
 * - Copies widget Swift sources into the ios/ build directory
 * - Adds a WidgetKit extension target to the Xcode project
 */
const {
  withEntitlementsPlist,
  withXcodeProject,
  withDangerousMod,
} = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const APP_GROUP_ID = 'group.com.github.taikonohimazin.poinotice';
const WIDGET_NAME = 'PoiNoticeWidgetExtension';
const WIDGET_DISPLAY_NAME = 'poi タイマー';

function withWidget(config) {
  // 1. Main app: add App Groups entitlement
  config = withEntitlementsPlist(config, (c) => {
    c.modResults['com.apple.security.application-groups'] = [APP_GROUP_ID];
    return c;
  });

  // 2. Copy widget files into ios/ directory & patch Podfile
  config = withDangerousMod(config, [
    'ios',
    async (c) => {
      const iosDir = c.modRequest.platformProjectRoot;
      const widgetDir = path.join(iosDir, WIDGET_NAME);
      fs.mkdirSync(widgetDir, { recursive: true });

      // Copy Swift sources
      const sourceDir = path.join(c.modRequest.projectRoot, 'targets', 'widget');
      for (const file of ['PoiNoticeWidget.swift', 'WidgetBundle.swift']) {
        fs.copyFileSync(path.join(sourceDir, file), path.join(widgetDir, file));
      }

      // Widget entitlements
      const entitlementsPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>com.apple.security.application-groups</key>
\t<array>
\t\t<string>${APP_GROUP_ID}</string>
\t</array>
</dict>
</plist>`;
      fs.writeFileSync(
        path.join(widgetDir, `${WIDGET_NAME}.entitlements`),
        entitlementsPlist,
      );

      // Widget Info.plist
      const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleDevelopmentRegion</key>
\t<string>ja</string>
\t<key>CFBundleDisplayName</key>
\t<string>${WIDGET_DISPLAY_NAME}</string>
\t<key>CFBundleExecutable</key>
\t<string>$(EXECUTABLE_NAME)</string>
\t<key>CFBundleIdentifier</key>
\t<string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
\t<key>CFBundleInfoDictionaryVersion</key>
\t<string>6.0</string>
\t<key>CFBundleName</key>
\t<string>$(PRODUCT_NAME)</string>
\t<key>CFBundlePackageType</key>
\t<string>$(PRODUCT_BUNDLE_PACKAGE_TYPE)</string>
\t<key>CFBundleShortVersionString</key>
\t<string>$(MARKETING_VERSION)</string>
\t<key>CFBundleVersion</key>
\t<string>$(CURRENT_PROJECT_VERSION)</string>
\t<key>NSExtension</key>
\t<dict>
\t\t<key>NSExtensionPointIdentifier</key>
\t\t<string>com.apple.widgetkit-extension</string>
\t</dict>
</dict>
</plist>`;
      fs.writeFileSync(path.join(widgetDir, 'Info.plist'), infoPlist);

      return c;
    },
  ]);

  // 3. Add widget extension target to Xcode project
  config = withXcodeProject(config, async (c) => {
    const proj = c.modResults;
    const mainBundleId = c.ios?.bundleIdentifier ?? 'com.github.taikonohimazin.poinotice';
    const widgetBundleId = `${mainBundleId}.widget`;

    // Add the extension target
    const target = proj.addTarget(
      WIDGET_NAME,
      'app_extension',
      WIDGET_NAME,
      widgetBundleId,
    );

    // Create a PBXGroup for widget files
    const groupKey = proj.pbxCreateGroup(WIDGET_NAME, WIDGET_NAME);

    // Add group to main project group
    const mainGroupId = proj.getFirstProject().firstProject.mainGroup;
    proj.addToPbxGroup(groupKey, mainGroupId);

    // Add Swift source files ONLY to the widget target (not the main app)
    const swiftFiles = ['PoiNoticeWidget.swift', 'WidgetBundle.swift'];
    for (const file of swiftFiles) {
      proj.addFile(`${WIDGET_NAME}/${file}`, groupKey);
    }
    proj.addBuildPhase(
      swiftFiles.map((f) => `${WIDGET_NAME}/${f}`),
      'PBXSourcesBuildPhase',
      'Sources',
      target.uuid,
    );

    // Update build settings for all configurations of the widget target
    const configs = proj.pbxXCBuildConfigurationSection();
    for (const key in configs) {
      const cfg = configs[key];
      if (!cfg || typeof cfg !== 'object' || !cfg.buildSettings) continue;

      // Match configs belonging to our widget target
      if (
        cfg.buildSettings.PRODUCT_BUNDLE_IDENTIFIER === widgetBundleId ||
        cfg.buildSettings.PRODUCT_BUNDLE_IDENTIFIER === `"${widgetBundleId}"`
      ) {
        Object.assign(cfg.buildSettings, {
          SWIFT_VERSION: '5.0',
          TARGETED_DEVICE_FAMILY: '"1"',
          IPHONEOS_DEPLOYMENT_TARGET: '17.0',
          CODE_SIGN_ENTITLEMENTS: `"${WIDGET_NAME}/${WIDGET_NAME}.entitlements"`,
          INFOPLIST_FILE: `"${WIDGET_NAME}/Info.plist"`,
          GENERATE_INFOPLIST_FILE: 'NO',
          MARKETING_VERSION: '1.0',
          CURRENT_PROJECT_VERSION: '1',
          CODE_SIGN_STYLE: 'Automatic',
          DEVELOPMENT_TEAM: '9ZKFA3GTJ7',
          PRODUCT_NAME: `"$(TARGET_NAME)"`,
          SKIP_INSTALL: 'YES',
          SWIFT_EMIT_LOC_STRINGS: 'YES',
          LD_RUNPATH_SEARCH_PATHS: '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"',
        });
      }
    }

    // NOTE: addTarget('app_extension') already creates a "Copy Files" phase
    // in the main target and adds the .appex product to it, so we do NOT
    // add another embed phase here — doing so causes "Unexpected duplicate
    // tasks" during xcodebuild archive.

    return c;
  });

  return config;
}

module.exports = withWidget;
