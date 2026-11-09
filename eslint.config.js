// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const queryPlugin = require('@tanstack/eslint-plugin-query');

const pluginQuery = queryPlugin.default ?? queryPlugin;

module.exports = defineConfig([
  expoConfig,
  ...pluginQuery.configs['flat/recommended'],
  {
    ignores: ['dist/*'],
  },
]);
