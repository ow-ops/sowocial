import { expiryChoices, isPollValid, newPoll, pollToDraft, toPollParams } from '@/api/ap/poll';
import { nextChain } from '@/api/compose-thread';
import { bskyPost } from './fixtures/bsky-agent';

const limits = { maxOptions: 4, maxCharactersPerOption: 10, minExpiration: 300, maxExpiration: 604800 };

describe('poll drafts', () => {
  it('offers only the presets the server allows, keeping an existing duration', () => {
    expect(expiryChoices({ ...limits, minExpiration: 3600, maxExpiration: 86400 })).toEqual([3600, 21600, 86400]);
    expect(expiryChoices(limits, 1000)).toContain(1000);
  });

  it('starts with two empty options and a one day expiry', () => {
    expect(newPoll(limits)).toEqual({ options: ['', ''], multiple: false, hideTotals: false, expiresIn: 86400 });
  });

  it('validates option count, length and duplicates against the limits', () => {
    const poll = { ...newPoll(limits), options: ['a', 'b'] };
    expect(isPollValid(poll, limits)).toBe(true);
    expect(isPollValid({ ...poll, options: ['a', ''] }, limits)).toBe(false);
    expect(isPollValid({ ...poll, options: ['a', 'a'] }, limits)).toBe(false);
    expect(isPollValid({ ...poll, options: ['a', 'x'.repeat(11)] }, limits)).toBe(false);
    expect(isPollValid({ ...poll, options: ['a', 'b', 'c', 'd', 'e'] }, limits)).toBe(false);
  });

  it('sends trimmed non-empty options', () => {
    expect(toPollParams({ options: [' a ', '', 'b'], multiple: true, hideTotals: false, expiresIn: 300 }).options).toEqual(['a', 'b']);
  });

  it('rebuilds a draft from an existing poll for editing', () => {
    const poll = {
      id: '1',
      expiresAt: new Date(Date.now() + 7200_000).toISOString(),
      expired: false,
      multiple: true,
      votesCount: 0,
      voted: false,
      ownVotes: [],
      options: [{ title: 'x', emojis: [] }, { title: 'y', emojis: [] }],
    };
    const draft = pollToDraft(poll, limits);
    expect(draft).toMatchObject({ options: ['x', 'y'], multiple: true, hideTotals: true });
    expect(draft.expiresIn).toBeGreaterThan(7000);
  });

  it('never produces a negative expiry for an expired poll', () => {
    const poll = {
      id: '1',
      expiresAt: new Date(Date.now() - 3600_000).toISOString(),
      expired: true,
      multiple: false,
      votesCount: 0,
      voted: false,
      ownVotes: [],
      options: [{ title: 'x', emojis: [] }, { title: 'y', emojis: [] }],
    };
    expect(pollToDraft(poll).expiresIn).toBeGreaterThan(0);
    expect(pollToDraft(poll, limits).expiresIn).toBeGreaterThanOrEqual(limits.minExpiration);
  });
});

describe('thread chaining', () => {
  it('replies to the previous fediverse post', () => {
    expect(nextChain({ kind: 'created', reply: false, id: '42' })).toEqual({ inReplyToId: '42' });
  });

  it('keeps the first Bluesky post as root and the latest as parent', () => {
    const first = { uri: 'at://a/app.bsky.feed.post/1', cid: 'c1' };
    const second = { uri: 'at://a/app.bsky.feed.post/2', cid: 'c2' };
    const afterFirst = nextChain({ kind: 'indexing', ref: first });
    expect(afterFirst).toEqual({ replyRef: { root: first, parent: first } });
    expect(nextChain({ kind: 'indexing', ref: second }, afterFirst)).toEqual({ replyRef: { root: first, parent: second } });
  });

  it('uses the thread root of the post being replied to', () => {
    const parent = bskyPost();
    const ref = { uri: 'at://a/app.bsky.feed.post/9', cid: 'c9' };
    expect(nextChain({ kind: 'indexing', ref }, undefined, parent)).toEqual({
      replyRef: { root: { uri: parent.uri, cid: parent.cid }, parent: ref },
    });
  });
});
