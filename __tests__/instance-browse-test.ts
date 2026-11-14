import { MastoHttpError } from 'masto';

import { availableActions, commentExcerpt } from '@/api/ap/moderation';
import { lacksScopes } from '@/auth/auth-failure';
import { classifyInstanceError } from '@/api/ap/instance-browse';
import { bareDomain } from '@/utils/acct';

jest.mock('@/utils/toast', () => ({ showError: jest.fn() }));
jest.mock('masto', () => ({
  createRestAPIClient: jest.fn(),
  MastoHttpError: class extends Error {
    statusCode: number;
    constructor({ statusCode, message }: { statusCode: number; message: string }) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

describe('bareDomain', () => {
  it('accepts a bare server domain', () => {
    expect(bareDomain('mastodon.social')).toBe('mastodon.social');
    expect(bareDomain('Example.CO.uk')).toBe('example.co.uk');
  });

  it('rejects handles, links and plain words', () => {
    expect(bareDomain('@user@mastodon.social')).toBeNull();
    expect(bareDomain('user@mastodon.social')).toBeNull();
    expect(bareDomain('https://mastodon.social/@a')).toBeNull();
    expect(bareDomain('mastodon')).toBeNull();
    expect(bareDomain('a.b')).toBeNull();
  });
});

describe('classifyInstanceError', () => {
  const http = (statusCode: number) => new MastoHttpError({ statusCode, message: 'x' });

  it('separates servers that restrict the timeline from missing ones', () => {
    expect(classifyInstanceError(http(401))).toBe('restricted');
    expect(classifyInstanceError(http(403))).toBe('restricted');
    expect(classifyInstanceError(http(404))).toBe('notFound');
  });

  it('leaves everything else as other', () => {
    expect(classifyInstanceError(http(500))).toBe('other');
    expect(classifyInstanceError(new Error('offline'))).toBe('other');
  });
});

describe('moderation scopes', () => {
  it('treats only a 403 from the server as missing scopes', () => {
    expect(lacksScopes(new MastoHttpError({ statusCode: 403, message: 'forbidden' } as never))).toBe(true);
    expect(lacksScopes(new MastoHttpError({ statusCode: 404, message: 'missing' } as never))).toBe(false);
    expect(lacksScopes(new Error('403'))).toBe(false);
  });
});

describe('moderation report actions', () => {
  const open = { actionTaken: false, assignedAccount: null };

  it('offers resolve on an open report and reopen on a resolved one', () => {
    expect(availableActions(open, 'me', false).report).toEqual(['resolve', 'assignToSelf']);
    expect(availableActions({ ...open, actionTaken: true }, 'me', false).report).toEqual(['reopen', 'assignToSelf']);
  });

  it('hides self-assignment when already assigned to the moderator or when the moderator is unknown', () => {
    const mine = { actionTaken: false, assignedAccount: { id: 'me' } as never };
    expect(availableActions(mine, 'me', false).report).toEqual(['resolve']);
    expect(availableActions(open, undefined, false).report).toEqual(['resolve']);
  });

  it('orders account actions from least to most severe', () => {
    expect(availableActions(open, 'me', false).account).toEqual(['silence', 'disable', 'suspend']);
  });

  it('limits GoToSocial to resolving and suspending', () => {
    expect(availableActions(open, 'me', true)).toEqual({ report: ['resolve'], account: ['suspend'] });
    expect(availableActions({ ...open, actionTaken: true }, 'me', true).report).toEqual([]);
  });
});

describe('commentExcerpt', () => {
  it('collapses whitespace and truncates long comments', () => {
    expect(commentExcerpt('  a\n\nb  ')).toBe('a b');
    expect(commentExcerpt('x'.repeat(100), 10)).toBe(`${'x'.repeat(10)}…`);
    expect(commentExcerpt('')).toBe('');
  });
});
