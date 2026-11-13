import { homePosition } from '@/api/home-position';
import { isNewer } from '@/api/snowflake';
import type { Post } from '@/model/post';
import { bskyPost } from './fixtures/bsky-agent';

jest.mock('@/auth/session', () => ({}));
jest.mock('@/api/backend', () => ({}));
jest.mock('@/api/ap/markers', () => ({}));
jest.mock('@/utils/kv', () => ({}));

const apPost = (cursor: string, sortAt = '2026-01-01T00:00:00.000Z') => ({ protocol: 'ap', cursor, sortAt }) as Post;

describe('home read position', () => {
  it('is the status id on the fediverse', () => {
    expect(homePosition(apPost('115000'))).toBe('115000');
  });

  it('is the post time on Bluesky, so it sorts like the timeline', () => {
    const older = bskyPost({ indexedAt: '2026-01-01T09:00:00Z' }, { createdAt: '2026-01-01T09:00:00Z' });
    const newer = bskyPost({ indexedAt: '2026-01-01T10:30:00.500Z' }, { createdAt: '2026-01-01T10:30:00.500+00:00' });
    expect(homePosition(older)).toBe('2026-01-01T09:00:00.000Z');
    expect(homePosition(newer)).toBe('2026-01-01T10:30:00.500Z');
    expect(isNewer(homePosition(newer), homePosition(older))).toBe(true);
    expect(isNewer(homePosition(older), homePosition(newer))).toBe(false);
  });

  it('falls back to the epoch when a Bluesky time cannot be read', () => {
    expect(homePosition({ ...bskyPost(), sortAt: 'not a date' })).toBe('1970-01-01T00:00:00.000Z');
  });
});
