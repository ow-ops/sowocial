import { Colors } from '@/constants/theme';
import { CONTRAST_PAIRS, contrastRatio } from '@/theme/contrast';

describe('contrastRatio', () => {
  it('matches WCAG for black on white', () => {
    expect(contrastRatio('#000', '#ffffff')).toBeCloseTo(21);
    expect(contrastRatio('#777777', '#fff')).toBeCloseTo(4.48, 1);
  });

  it('parses rgb() and hsl()', () => {
    expect(contrastRatio('rgb(0,0,0)', '#fff')).toBeCloseTo(21);
    expect(contrastRatio('hsl(0, 0%, 0%)', 'rgb(255 255 255)')).toBeCloseTo(21);
  });

  it('skips colors it cannot parse', () => {
    expect(contrastRatio('black', '#fff')).toBeNull();
  });
});

describe('built-in palettes', () => {
  it.each(['light', 'dark'] as const)('%s meets every contrast pair', (kind) => {
    for (const [fg, bg, min] of CONTRAST_PAIRS) {
      const ratio = contrastRatio(Colors[kind][fg], Colors[kind][bg]);
      expect({ fg, bg, ok: ratio !== null && ratio >= min }).toEqual({ fg, bg, ok: true });
    }
  });
});

describe('card separation', () => {
  it.each(['light', 'dark'] as const)('%s surface stands apart from canvas', (kind) => {
    expect(contrastRatio(Colors[kind].surface, Colors[kind].canvas)).toBeGreaterThanOrEqual(1.1);
  });
});
