import en from '@/i18n/locales/en';
import fr from '@/i18n/locales/fr';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((out, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? { ...out, [path]: value } : { ...out, ...flatten(value, path) };
  }, {});
}

const base = (key: string) => key.replace(/_(zero|one|two|few|many|other)$/, '');
const placeholders = (text: string) => [...text.matchAll(/{{\s*([\w.]+)[\s,}]/g)].map((m) => m[1]).sort();

const english = flatten(en as Tree);
const french = flatten(fr as Tree);

describe('locales', () => {
  it('have the same keys', () => {
    expect(Object.keys(french).sort()).toEqual(Object.keys(english).sort());
  });

  it('use the same interpolation placeholders', () => {
    const byBase = (strings: Record<string, string>) =>
      Object.entries(strings).reduce<Record<string, string[]>>(
        (out, [key, text]) => ({ ...out, [base(key)]: [...new Set([...(out[base(key)] ?? []), ...placeholders(text)])].sort() }),
        {},
      );
    expect(byBase(french)).toEqual(byBase(english));
  });

  it('have no empty strings', () => {
    expect(Object.entries(french).filter(([, text]) => !text.trim())).toEqual([]);
    expect(Object.entries(english).filter(([, text]) => !text.trim())).toEqual([]);
  });
});
