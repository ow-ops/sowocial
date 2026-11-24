const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const resolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = resolveRequest ?? context.resolveRequest;
  // Expo Router ships its own React Navigation; the native tab navigator has to register with that copy.
  if (/^@react-navigation\/(native|core)$/.test(moduleName) && context.originModulePath.includes('@bottom-tabs')) {
    return resolve({ ...context, originModulePath: path.join(__dirname, 'package.json') }, 'expo-router/react-navigation', platform);
  }
  try {
    return resolve(context, moduleName, platform);
  } catch (error) {
    if (moduleName.startsWith('./') && moduleName.endsWith('.js') && context.originModulePath.includes('oauth-client-expo')) {
      return resolve(context, moduleName.slice(0, -3), platform);
    }
    throw error;
  }
};

module.exports = config;
