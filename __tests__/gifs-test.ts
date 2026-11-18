import { parseKlipy } from '@/api/gifs';

const file = (name: string, size: number, width = 220) => ({ url: `https://static.klipy.com/ii/a/b/${name}`, width, height: width, size });

describe('parseKlipy', () => {
  it('takes the medium GIF to post and the small WebP to preview', () => {
    const payload = {
      result: true,
      data: { data: [{ id: 8041071659142944, title: 'Hello', file: { md: { gif: file('md.gif', 3_000_000, 498) }, sm: { gif: file('sm.gif', 300_000) }, xs: { webp: file('xs.webp', 80_000), gif: file('xs.gif', 300_000) } } }] },
    };
    expect(parseKlipy(payload)).toEqual([
      { id: '8041071659142944', title: 'Hello', url: file('md.gif', 0).url, preview: file('xs.webp', 0).url, width: 498, height: 498, size: 3_000_000 },
    ]);
  });

  it('falls back to the small GIF when the medium one is too large to proxy', () => {
    const [gif] = parseKlipy({ data: { data: [{ id: 1, file: { md: { gif: file('md.gif', 9_000_000) }, sm: { gif: file('sm.gif', 300_000) } } }] } });
    expect(gif.url).toBe(file('sm.gif', 0).url);
    expect(gif.preview).toBe(gif.url);
  });

  it('skips items without a GIF and payloads of another shape', () => {
    expect(parseKlipy({ data: { data: [{ id: 2, title: 'ad', file: {} }, { title: 'no id', file: { md: { gif: file('x.gif', 1) } } }] } })).toEqual([]);
    expect(parseKlipy({ results: [] })).toEqual([]);
    expect(parseKlipy(null)).toEqual([]);
  });
});
