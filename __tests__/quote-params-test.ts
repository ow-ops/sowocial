import type { Post } from '@/model/post';
import { quoteParams } from '@/utils/links';

const post = (over: { protocol?: 'ap' | 'bsky'; quotable?: boolean; reblog?: boolean; url?: string }) =>
  ({
    id: '42',
    protocol: over.protocol ?? 'ap',
    url: 'url' in over ? over.url : 'https://example.social/@alice/42',
    viewer: { quotable: over.quotable ?? false },
    capabilities: { reblog: over.reblog ?? true },
  }) as unknown as Post;

describe('quote params', () => {
  it('quotes natively when the server supports quotes and the post allows it', () => {
    expect(quoteParams(post({ quotable: true }), true)).toEqual({ quote: '42' });
    expect(quoteParams(post({ protocol: 'bsky', quotable: true }), true)).toEqual({ quote: '42' });
  });

  it('offers nothing when the server supports quotes but the post does not allow them', () => {
    expect(quoteParams(post({ quotable: false }), true)).toBeUndefined();
  });

  it('falls back to a link quote on fediverse servers without quotes', () => {
    expect(quoteParams(post({}), false)).toEqual({ quoteLink: 'https://example.social/@alice/42' });
  });

  it('offers no link quote for posts that cannot be boosted or have no URL', () => {
    expect(quoteParams(post({ reblog: false }), false)).toBeUndefined();
    expect(quoteParams(post({ url: undefined }), false)).toBeUndefined();
    expect(quoteParams(post({ protocol: 'bsky' }), false)).toBeUndefined();
  });
});
