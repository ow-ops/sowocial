import type { ExpoConfig } from 'expo/config';
import { withAndroidManifest, withProjectBuildGradle } from 'expo/config-plugins';

const NDK_VERSION = '29.0.14206865';

// expo-root-project only fills ext.ndkVersion when it is unset, so set it before the plugin applies.
const withNdkVersion = (config: ExpoConfig) =>
  withProjectBuildGradle(config, (mod) => {
    const anchor = 'apply plugin: "expo-root-project"';
    if (!mod.modResults.contents.includes('ext.ndkVersion')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        anchor,
        `ext.ndkVersion = '${NDK_VERSION}'\n${anchor}`,
      );
    }
    return mod;
  });

// Play treats these permissions as required hardware: ACCESS_WIFI_STATE (expo-network) as wifi,
// CAMERA as a camera with autofocus, RECORD_AUDIO as a microphone. The app works without any of them.
const OPTIONAL_HARDWARE = ['android.hardware.wifi', 'android.hardware.camera', 'android.hardware.camera.autofocus', 'android.hardware.microphone'];

const withOptionalHardware = (config: ExpoConfig) =>
  withAndroidManifest(config, (mod) => {
    const declared = (mod.modResults.manifest['uses-feature'] ?? []).filter((f) => !OPTIONAL_HARDWARE.includes(f.$['android:name']));
    mod.modResults.manifest['uses-feature'] = [
      ...declared,
      ...OPTIONAL_HARDWARE.map((name) => ({ $: { 'android:name': name, 'android:required': 'false' as const } })),
    ];
    return mod;
  });

export default ({ config }: { config: ExpoConfig }): ExpoConfig => {
  const nightly = process.env.SOWOCIAL_CHANNEL === 'nightly';
  const { SOWOCIAL_VERSION, SOWOCIAL_VERSION_CODE } = process.env;

  return withOptionalHardware(
    withNdkVersion({
      ...config,
      name: nightly ? 'sowocial Nightly' : config.name,
      version: SOWOCIAL_VERSION ?? config.version,
      ios: {
        ...config.ios,
        // App Store Connect takes at most three version parts; nightlies differ by build number.
        ...(SOWOCIAL_VERSION && { version: SOWOCIAL_VERSION.split('.').slice(0, 3).join('.') }),
        ...(SOWOCIAL_VERSION_CODE && { buildNumber: SOWOCIAL_VERSION_CODE }),
      },
      android: {
        ...config.android,
        package: nightly ? 'eu.owops.sowocial.nightly' : config.android?.package,
        ...(SOWOCIAL_VERSION_CODE && { versionCode: Number(SOWOCIAL_VERSION_CODE) }),
      },
    }),
  );
};
