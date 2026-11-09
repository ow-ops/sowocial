import { interpretLabelValueDefinition, type ModerationOpts } from '@atproto/api';

import { moderatedPost, profileModeration } from '@/model/moderation';
import { toAuthor } from '@/model/adapters/bsky';
import { bskyPost } from './fixtures/bsky-agent';

jest.mock('@/auth/bsky-loader', () => {
  const { moderatePost, moderateProfile } = jest.requireActual('@atproto/api');
  return { getBskyModeration: () => ({ moderatePost, moderateProfile }) };
});

const LABELER = 'did:plc:labeler';
const AUTHOR = 'did:plc:author';
const URI = 'at://did:plc:author/app.bsky.feed.post/3kpost';

const label = (val: string, src = LABELER) => ({ src, uri: URI, val, cts: '2026-01-01T00:00:00.000Z' });

const spoiler = (severity: 'inform' | 'alert' | 'none', blurs: 'content' | 'media' | 'none') =>
  interpretLabelValueDefinition(
    {
      identifier: 'spoiler',
      severity,
      blurs,
      defaultSetting: 'warn',
      adultOnly: false,
      locales: [{ lang: 'en', name: 'Spoiler', description: 'May spoil a story' }],
    },
    LABELER,
  );

function opts(overrides: Partial<ModerationOpts['prefs']> = {}, labels: Record<string, 'ignore' | 'warn' | 'hide'> = {}, def = spoiler('alert', 'content')): ModerationOpts {
  return {
    userDid: 'did:plc:me',
    prefs: {
      adultContentEnabled: true,
      labels: {},
      labelers: [{ did: LABELER, labels }],
      mutedWords: [],
      hiddenPosts: [],
      ...overrides,
    },
    labelDefs: { [LABELER]: [def] },
  };
}

describe('moderatedPost', () => {
  it('returns the post untouched without moderation options or a Bluesky view', () => {
    const post = bskyPost({ labels: [label('graphic-media')] });
    expect(moderatedPost(post, undefined)).toBe(post);
    expect(moderatedPost({ ...post, raw: undefined }, opts())).toEqual({ ...post, raw: undefined });
  });

  it('returns the same object when nothing applies', () => {
    const post = bskyPost();
    expect(moderatedPost(post, opts())).toBe(post);
  });

  it('blurs media for a labeler label set to warn', () => {
    const post = bskyPost({ labels: [label('graphic-media')] });
    const result = moderatedPost(post, opts({}, { 'graphic-media': 'warn' }));
    expect(result.sensitive).toBe(true);
    expect(result.filters).toBeUndefined();
  });

  it('hides a post whose label is set to hide', () => {
    const post = bskyPost({ labels: [label('graphic-media')] });
    const result = moderatedPost(post, opts({}, { 'graphic-media': 'hide' }));
    expect(result.filters).toEqual([{ title: 'Graphic media', action: 'hide' }]);
  });

  it('honours an ignored adult label instead of the built-in blur', () => {
    const post = bskyPost({ labels: [label('porn', AUTHOR)] });
    expect(post.sensitive).toBe(true);
    expect(moderatedPost(post, opts({ labels: { porn: 'ignore' } })).sensitive).toBe(false);
  });

  it('hides adult media when adult content is disabled', () => {
    const post = bskyPost({ labels: [label('porn', AUTHOR)] });
    const result = moderatedPost(post, opts({ adultContentEnabled: false }));
    expect(result.filters).toEqual([{ title: 'Adult content', action: 'hide' }]);
    expect(result.sensitive).toBe(true);
  });

  it('turns a content blur into a warning named by the label', () => {
    const post = bskyPost({ labels: [label('spoiler')] });
    const result = moderatedPost(post, opts({}, { spoiler: 'warn' }, spoiler('alert', 'content')));
    expect(result.contentWarning).toBe('Spoiler');
    expect(result.filters).toBeUndefined();
  });

  it('keeps an existing content warning', () => {
    const post = { ...bskyPost({ labels: [label('spoiler')] }), contentWarning: 'Mine' };
    expect(moderatedPost(post, opts({}, { spoiler: 'warn' }), 'contentList').contentWarning).toBe('Mine');
  });

  it('shows a badge for an informational label', () => {
    const post = bskyPost({ labels: [label('spoiler')] });
    const result = moderatedPost(post, opts({}, { spoiler: 'warn' }, spoiler('inform', 'none')));
    expect(result.contentWarning).toBeUndefined();
    expect(result.labels).toEqual(['Spoiler']);
  });

  it('hides a post that matches a muted word', () => {
    const post = bskyPost({}, { text: 'big spoilers ahead' });
    const result = moderatedPost(post, opts({ mutedWords: [{ value: 'spoilers', targets: ['content'], actorTarget: 'all' }] }));
    expect(result.filters).toEqual([{ title: 'Muted word', action: 'hide' }]);
  });

  it('hides a post by name when the viewer hid it', () => {
    const post = bskyPost();
    expect(moderatedPost(post, opts({ hiddenPosts: [post.uri] })).filters).toEqual([{ title: 'Hidden by you', action: 'hide' }]);
  });
});

describe('profileModeration', () => {
  const profile = (labels: ReturnType<typeof label>[]) =>
    toAuthor({ did: AUTHOR, handle: 'author.test', labels: labels.map((l) => ({ ...l, uri: AUTHOR })) });

  it('lists account labels and blurs the avatar for adult labels', () => {
    const adult = profile([{ ...label('porn', AUTHOR), uri: AUTHOR }]);
    expect(profileModeration(adult, opts({ adultContentEnabled: false })).blurAvatar).toBe(true);
    expect(profileModeration(adult, opts()).blurAvatar).toBe(true);
  });

  it('is empty without options', () => {
    expect(profileModeration(profile([]), undefined)).toEqual({ labels: [], blurAvatar: false });
  });
});
