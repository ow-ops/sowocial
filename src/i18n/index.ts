import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { enUS, fr, type Locale } from 'date-fns/locale';

import './intl-pluralrules';
import en from './locales/en';
import frStrings from './locales/fr';

const resources = { en: { translation: en }, fr: { translation: frStrings } };

const supported = Object.keys(resources);
const detected = getLocales().find((l) => l.languageCode && supported.includes(l.languageCode))?.languageCode;

const i18n = createInstance();

i18n.use(initReactI18next).init({
  resources,
  lng: detected ?? 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export const t = i18n.t.bind(i18n);

export const dateLocale = (): Locale => (i18n.language === 'fr' ? fr : enUS);

export const intlLocale = () => i18n.language;

export default i18n;
