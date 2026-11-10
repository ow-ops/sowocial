import type { ExpoConfig } from 'expo/config';

export default ({ config }: { config: ExpoConfig }): ExpoConfig => {
  const nightly = process.env.SOWOCIAL_CHANNEL === 'nightly';
  const { SOWOCIAL_VERSION, SOWOCIAL_VERSION_CODE } = process.env;

  return {
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
  };
};
