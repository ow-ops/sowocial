import type { Agent } from '@atproto/api';

import { buildReport, createBskyReport, MODERATION_SERVICE } from '@/api/bsky/report';

describe('buildReport', () => {
  it('reports an account by DID', () => {
    expect(buildReport('spam', ' ads everywhere ', { did: 'did:plc:bad' })).toEqual({
      reasonType: 'com.atproto.moderation.defs#reasonSpam',
      reason: 'ads everywhere',
      subject: { $type: 'com.atproto.admin.defs#repoRef', did: 'did:plc:bad' },
    });
  });

  it('reports a post by strong reference and drops an empty reason', () => {
    expect(buildReport('violation', '  ', { uri: 'at://did:plc:bad/app.bsky.feed.post/3k', cid: 'bafycid' })).toEqual({
      reasonType: 'com.atproto.moderation.defs#reasonViolation',
      reason: undefined,
      subject: { $type: 'com.atproto.repo.strongRef', uri: 'at://did:plc:bad/app.bsky.feed.post/3k', cid: 'bafycid' },
    });
  });

  it('maps the other category', () => {
    expect(buildReport('other', 'x', { did: 'did:plc:bad' }).reasonType).toBe('com.atproto.moderation.defs#reasonOther');
  });
});

describe('createBskyReport', () => {
  it('sends the report through the moderation service proxy', async () => {
    const createReport = jest.fn().mockResolvedValue({ data: {} });
    const proxied = { com: { atproto: { moderation: { createReport } } } };
    const withProxy = jest.fn().mockReturnValue(proxied);

    await createBskyReport({ withProxy } as unknown as Agent, 'spam', 'hi', { did: 'did:plc:bad' });

    expect(withProxy).toHaveBeenCalledWith('atproto_labeler', MODERATION_SERVICE);
    expect(createReport).toHaveBeenCalledWith(buildReport('spam', 'hi', { did: 'did:plc:bad' }));
  });

  it('uses a custom moderation service when given', async () => {
    const createReport = jest.fn().mockResolvedValue({ data: {} });
    const withProxy = jest.fn().mockReturnValue({ com: { atproto: { moderation: { createReport } } } });

    await createBskyReport({ withProxy } as unknown as Agent, 'spam', 'hi', { did: 'did:plc:bad' }, 'did:web:mod.example#my_labeler');

    expect(withProxy).toHaveBeenCalledWith('my_labeler', 'did:web:mod.example');
  });
});
