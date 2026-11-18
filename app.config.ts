import type { ExpoConfig } from 'expo/config';
import { withProjectBuildGradle } from 'expo/config-plugins';

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

export default ({ config }: { config: ExpoConfig }): ExpoConfig => {
  const nightly = process.env.SOWOCIAL_CHANNEL === 'nightly';
  const { SOWOCIAL_VERSION, SOWOCIAL_VERSION_CODE } = process.env;

  return withNdkVersion({
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
  });
};
