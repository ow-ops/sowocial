import type { Agent, BlobRef } from '@atproto/api';

import { detectRichText } from '@/api/bsky/richtext';
import { buildEmbed, buildLabels, graphemeCount, replyRefs, strongRef } from '@/api/bsky/compose';
import { bskyPost } from './fixtures/bsky-agent';

const image = { image: {} as BlobRef, alt: 'a cat', aspectRatio: { width: 4, height: 3 } };

describe('replyRefs', () => {
  it('uses the parent as its own root for a top-level post', () => {
    const parent = bskyPost();
    const ref = { uri: parent.uri, cid: parent.cid };
    expect(replyRefs(parent)).toEqual({ root: ref, parent: ref });
  });

  it('keeps the thread root when replying to a reply', () => {
    const root = { uri: 'at://did:plc:root/app.bsky.feed.post/root', cid: 'bafyroot' };
    const parent = bskyPost(
      { uri: 'at://did:plc:author/app.bsky.feed.post/child', cid: 'bafychild' },
      { reply: { root, parent: root } },
    );
    expect(replyRefs(parent)).toEqual({
      root,
      parent: { uri: 'at://did:plc:author/app.bsky.feed.post/child', cid: 'bafychild' },
    });
  });
});

describe('buildEmbed', () => {
  const quote = strongRef(bskyPost());

  it('returns nothing without a quote or images', () => {
    expect(buildEmbed(undefined, [])).toBeUndefined();
  });

  it('builds a record embed for a quote', () => {
    expect(buildEmbed(quote, [])).toEqual({ $type: 'app.bsky.embed.record', record: quote });
  });

  it('builds an images embed', () => {
    expect(buildEmbed(undefined, [image])).toEqual({ $type: 'app.bsky.embed.images', images: [image] });
  });

  it('builds recordWithMedia for a quote with images', () => {
    expect(buildEmbed(quote, [image])).toEqual({
      $type: 'app.bsky.embed.recordWithMedia',
      record: { $type: 'app.bsky.embed.record', record: quote },
      media: { $type: 'app.bsky.embed.images', images: [image] },
    });
  });
});

describe('buildEmbed with video', () => {
  const quote = strongRef(bskyPost());
  const video = {
    video: { ref: 'blob' } as unknown as BlobRef,
    alt: 'a cat',
    aspectRatio: { width: 9, height: 16 },
  };

  it('builds a video embed', () => {
    expect(buildEmbed(undefined, [], video)).toEqual({
      $type: 'app.bsky.embed.video',
      video: video.video,
      alt: 'a cat',
      aspectRatio: video.aspectRatio,
    });
  });

  it('omits an empty alt text', () => {
    expect(buildEmbed(undefined, [], { ...video, alt: '' })).toMatchObject({ alt: undefined });
  });

  it('builds recordWithMedia for a quote with a video', () => {
    expect(buildEmbed(quote, [], video)).toEqual({
      $type: 'app.bsky.embed.recordWithMedia',
      record: { $type: 'app.bsky.embed.record', record: quote },
      media: { $type: 'app.bsky.embed.video', video: video.video, alt: 'a cat', aspectRatio: video.aspectRatio },
    });
  });
});

describe('buildLabels', () => {
  it('wraps a self label', () => {
    expect(buildLabels('sexual')).toEqual({ $type: 'com.atproto.label.defs#selfLabels', values: [{ val: 'sexual' }] });
    expect(buildLabels()).toBeUndefined();
  });
});

describe('graphemeCount', () => {
  it('counts user-perceived characters', () => {
    expect(graphemeCount('hello')).toBe(5);
    expect(graphemeCount('😀')).toBe(1);
    expect(graphemeCount('👨‍👩‍👧‍👦')).toBe(1);
    expect(graphemeCount('🇫🇷')).toBe(1);
    expect(graphemeCount('é')).toBe(1);
    expect(graphemeCount('👍🏽a')).toBe(2);
  });
});

describe('detectRichText', () => {
  it('detects a mention, a link and a tag with utf8 byte offsets', async () => {
    const resolveHandle = jest.fn(async () => ({ data: { did: 'did:plc:alice' } }));
    const agent = { com: { atproto: { identity: { resolveHandle } } } } as unknown as Agent;
    const text = 'héllo @alice.test see https://example.com/page #sowocial';

    const rt = await detectRichText(agent, text);

    expect(resolveHandle).toHaveBeenCalledWith({ handle: 'alice.test' });
    const features = (rt.facets ?? []).flatMap((f) => f.features.map((x) => ({ ...x })));
    expect(features).toEqual([
      { $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:alice' },
      { $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com/page' },
      { $type: 'app.bsky.richtext.facet#tag', tag: 'sowocial' },
    ]);
    const mention = rt.facets![0].index;
    expect(new TextDecoder().decode(new TextEncoder().encode(text).slice(mention.byteStart, mention.byteEnd))).toBe('@alice.test');
  });

  it('leaves an unresolvable handle as plain text', async () => {
    const resolveHandle = jest.fn(async () => {
      throw new Error('not found');
    });
    const agent = { com: { atproto: { identity: { resolveHandle } } } } as unknown as Agent;
    const rt = await detectRichText(agent, 'hi @nobody.test');
    expect(rt.facets ?? []).toHaveLength(0);
  });
});
