/* eslint-disable @typescript-eslint/no-require-imports */
// Hermes has no Intl.PluralRules, which i18next needs for plural forms. The package is ESM-only, so
// it is required lazily to keep Jest (which has native Intl.PluralRules) from loading it.
if (typeof Intl.PluralRules === 'undefined') {
  require('@formatjs/intl-pluralrules/polyfill-force.js');
  require('@formatjs/intl-pluralrules/locale-data/en.js');
  require('@formatjs/intl-pluralrules/locale-data/fr.js');
}
