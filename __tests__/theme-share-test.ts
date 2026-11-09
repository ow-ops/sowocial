jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-file-system', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('expo-linking', () => ({}));

import { decodeTheme, encodeTheme } from '@/theme/share';

const css = '/*\n@sowocial-theme\nname: Dusk\n*/\n:root { --sowocial-page: #0c0a14; }\n';

describe('theme links', () => {
  it('round-trips css and refuses garbage', () => {
    expect(decodeTheme(encodeTheme(css))).toBe(css);
    expect(decodeTheme('not base64 gzip')).toBeNull();
  });

  it('is URL-safe and survives + turning into a space', () => {
    const encoded = encodeTheme(css.repeat(20));
    expect(encoded).toMatch(/^[\w-]+$/);
    const standard = encoded.replace(/-/g, '+').replace(/_/g, '/');
    expect(decodeTheme(standard.replace(/\+/g, ' '))).toBe(css.repeat(20));
  });
});
