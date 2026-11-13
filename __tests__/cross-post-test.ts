import { AP_CAPABILITIES, BSKY_CAPABILITIES } from '@/api/backend/capabilities';
import type { PostDraft } from '@/api/backend/types';
import { type CrossTarget, crossTarget, fitCrossPost } from '@/api/cross-post';

const draft = (overrides: Partial<PostDraft> = {}): PostDraft => ({ status: 'hello', visibility: 'public', media: [], ...overrides });

const image = (focus?: { x: number; y: number }) => ({ uri: 'file:///a.jpg', description: 'a cat', focus });

const bluesky: CrossTarget = { capabilities: BSKY_CAPABILITIES, limits: { characters: 300, reservedPerUrl: 0, media: 4 } };
const fediverse: CrossTarget = { capabilities: AP_CAPABILITIES, limits: { characters: 500, reservedPerUrl: 23, media: 4 } };

describe('fitCrossPost visibility', () => {
  it('sends public posts to Bluesky', () => {
    expect(fitCrossPost(draft(), bluesky)).toHaveProperty('draft');
  });

  it('never sends unlisted or private posts to Bluesky', () => {
    expect(fitCrossPost(draft({ visibility: 'unlisted' }), bluesky)).toEqual({ blocked: 'visibility' });
    expect(fitCrossPost(draft({ visibility: 'private' }), bluesky)).toEqual({ blocked: 'visibility' });
  });

  it('sends unlisted posts to the fediverse', () => {
    expect(fitCrossPost(draft({ visibility: 'unlisted' }), fediverse)).toHaveProperty('draft');
  });
});

describe('fitCrossPost length', () => {
  it('allows exactly the Bluesky grapheme limit and no more', () => {
    expect(fitCrossPost(draft({ status: 'a'.repeat(300) }), bluesky)).toHaveProperty('draft');
    expect(fitCrossPost(draft({ status: 'a'.repeat(301) }), bluesky)).toEqual({ blocked: 'length' });
  });

  it('counts a grapheme as one character, not as UTF-16 units', () => {
    expect(fitCrossPost(draft({ status: '👍'.repeat(300) }), bluesky)).toHaveProperty('draft');
  });

  it('counts each link as the server reserves for it', () => {
    const small: CrossTarget = { capabilities: AP_CAPABILITIES, limits: { characters: 30, reservedPerUrl: 23, media: 4 } };
    expect(fitCrossPost(draft({ status: 'https://example.com/' + 'a'.repeat(200) }), small)).toHaveProperty('draft');
    expect(fitCrossPost(draft({ status: 'x'.repeat(31) }), small)).toEqual({ blocked: 'length' });
  });

  it('counts the content warning toward the Bluesky limit', () => {
    const warned = (status: string) => draft({ status, spoilerText: 'spoiler' });
    expect(fitCrossPost(warned('a'.repeat(280)), bluesky)).toHaveProperty('draft');
    expect(fitCrossPost(warned('a'.repeat(290)), bluesky)).toEqual({ blocked: 'length' });
  });
});

describe('fitCrossPost content warning', () => {
  it('prepends the warning as a first line for Bluesky', () => {
    const fit = fitCrossPost(draft({ status: 'hello', spoilerText: 'spoiler' }), bluesky);
    expect(fit).toHaveProperty('draft.status', 'CW: spoiler\nhello');
    expect(fit).toHaveProperty('draft.spoilerText', undefined);
  });

  it('keeps the warning for the fediverse', () => {
    expect(fitCrossPost(draft({ spoilerText: 'spoiler' }), fediverse)).toHaveProperty('draft.spoilerText', 'spoiler');
  });
});

describe('fitCrossPost options', () => {
  const fediverseOnly = draft({
    sensitive: true,
    gts: { localOnly: true },
    media: [image({ x: 0.1, y: 0.2 })],
  });
  const blueskyOnly = draft({ label: 'nudity', interactions: { replies: 'nobody', quotes: false } });

  it('keeps fediverse-only options for the fediverse and drops them for Bluesky', () => {
    expect(fitCrossPost(fediverseOnly, fediverse)).toHaveProperty('draft', expect.objectContaining({ sensitive: true, gts: { localOnly: true } }));
    expect(fitCrossPost(fediverseOnly, fediverse)).toHaveProperty('draft.media.0.focus', { x: 0.1, y: 0.2 });
    expect(fitCrossPost(fediverseOnly, bluesky)).toHaveProperty('draft', expect.objectContaining({ sensitive: undefined, gts: undefined }));
    expect(fitCrossPost(fediverseOnly, bluesky)).toHaveProperty('draft.media', [{ uri: 'file:///a.jpg', description: 'a cat' }]);
  });

  it('keeps Bluesky-only options for Bluesky and drops them for the fediverse', () => {
    expect(fitCrossPost(blueskyOnly, bluesky)).toHaveProperty('draft', expect.objectContaining({ label: 'nudity', interactions: { replies: 'nobody', quotes: false } }));
    expect(fitCrossPost(blueskyOnly, fediverse)).toHaveProperty('draft', expect.objectContaining({ label: undefined, interactions: undefined }));
  });

  it('keeps the language for both', () => {
    expect(fitCrossPost(draft({ language: 'fr' }), bluesky)).toHaveProperty('draft.language', 'fr');
    expect(fitCrossPost(draft({ language: 'fr' }), fediverse)).toHaveProperty('draft.language', 'fr');
  });
});

describe('fitCrossPost media and video', () => {
  it('blocks more images than the target allows', () => {
    const five = draft({ media: [image(), image(), image(), image(), image()] });
    expect(fitCrossPost(five, bluesky)).toEqual({ blocked: 'media' });
    expect(fitCrossPost(draft({ media: [image(), image(), image(), image()] }), bluesky)).toHaveProperty('draft');
  });

  it('blocks a video the target cannot take', () => {
    const video = { uri: 'file:///v.mp4', description: '', width: 16, height: 9, size: 1000, durationMs: 1000, mimeType: 'video/mp4' };
    expect(fitCrossPost(draft({ video }), fediverse)).toEqual({ blocked: 'video' });
    expect(fitCrossPost(draft({ video }), bluesky)).toHaveProperty('draft.video', video);
  });
});

describe('crossTarget', () => {
  it('gives a Bluesky account its fixed limits', () => {
    expect(crossTarget({ protocol: 'bsky' })).toEqual(bluesky);
  });

  it('gives a fediverse account the limits its server reports', () => {
    const statuses = { maxCharacters: 500, charactersReservedPerUrl: 23, maxMediaAttachments: 4 };
    expect(crossTarget({ protocol: 'ap' }, statuses)).toEqual(fediverse);
  });

  it('has no target for a fediverse account until its server has answered', () => {
    expect(crossTarget({ protocol: 'ap' })).toBeUndefined();
  });
});
