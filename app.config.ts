import type { ExpoConfig } from 'expo/config';

export default ({ config }: { config: ExpoConfig }): ExpoConfig => {
  const nightly = process.env.SOWOCIAL_CHANNEL === 'nightly';
  const { SOWOCIAL_VERSION, SOWOCIAL_VERSION_CODE } = process.env;

  return {
    ...config,
    name: nightly ? 'sowocial Nightly' : config.name,
    version: SOWOCIAL_VERSION ?? config.version,
    android: {
      ...config.android,
      package: nightly ? 'eu.owops.sowocial.nightly' : config.android?.package,
      ...(SOWOCIAL_VERSION_CODE && { versionCode: Number(SOWOCIAL_VERSION_CODE) }),
    },
  };
};
