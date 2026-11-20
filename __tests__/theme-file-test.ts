import { Colors } from '@/constants/theme';
import { parseThemeFile, serializeThemeFile, type ThemeFile } from '@/theme/theme-file';

const dusk = `/*
@sowocial-theme
name: Dusk
author: someone
kind: dark
contrast: high
tags: purple, calm
*/
:root {
  --sowocial-page: #0c0a14;
  --sowocial-on-primary: #000000;
  --sowocial-primary: url(https://evil.example/x.png);
  --other: #fff;
}
.status { --sowocial-text: #ff0000; }`;

describe('parseThemeFile', () => {
  it('reads the Sable header and root sowocial tokens only', () => {
    expect(parseThemeFile(dusk)).toEqual({
      type: 'theme',
      meta: {
        name: 'Dusk',
        author: 'someone',
        description: null,
        kind: 'dark',
        contrast: 'high',
        tags: ['purple', 'calm'],
      },
      tokens: { page: '#0c0a14', onPrimary: '#000000' },
    });
  });

  it('refuses Sable themes and files without colors', () => {
    expect(parseThemeFile('/*\n@sable-theme\n*/ :root { --sable-bg-container: #000; }')).toBe('header');
    expect(parseThemeFile('/*\n@sowocial-theme\n*/ :root {}')).toBe('empty');
    expect(parseThemeFile('x'.repeat(1024 * 1024 + 1))).toBe('size');
  });

  it('defaults a theme to light and leaves a tweak for both', () => {
    const theme = parseThemeFile('/* @sowocial-theme */ :root { --sowocial-page: #fff; }');
    const tweak = parseThemeFile('/* @sowocial-tweak */ :root { --sowocial-primary: #f00; }');
    expect(typeof theme !== 'string' && theme.meta.kind).toBe('light');
    expect(typeof tweak !== 'string' && tweak.meta.kind).toBeNull();
  });

  it('parses a 1 MB file with no braces in linear time', () => {
    for (const filler of ['a ', '/*', '\n ', '}']) {
      const css = `/* @sowocial-theme */${filler.repeat(500_000)}`;
      const start = performance.now();
      expect(parseThemeFile(css)).toBe('empty');
      expect(performance.now() - start).toBeLessThan(500);
    }
  });

  it('reads root blocks nested in a media query', () => {
    const css = '/* @sowocial-theme */ @media screen { :root { --sowocial-page: #123456; } .a { color: red } }';
    expect(parseThemeFile(css)).toMatchObject({ tokens: { page: '#123456' } });
  });

  it('round-trips through serializeThemeFile', () => {
    const file: ThemeFile = {
      type: 'theme',
      meta: { name: 'All', author: null, description: null, kind: 'dark', contrast: 'low', tags: [] },
      tokens: { ...Colors.dark },
    };
    expect(parseThemeFile(serializeThemeFile(file))).toEqual(file);
  });
});
