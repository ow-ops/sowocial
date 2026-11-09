/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'notification-service',
  name: 'PushService',
  bundleIdentifier: '.push',
  deploymentTarget: '15.1',
  entitlements: {
    // The app stores the Web Push keys in its default keychain group (its own app ID);
    // the extension joins that group to read them.
    'keychain-access-groups': [`$(AppIdentifierPrefix)${config.ios.bundleIdentifier}`],
  },
});
