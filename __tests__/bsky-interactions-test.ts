import type { Agent } from '@atproto/api';

import { reserveToggle, runToggle } from '@/api/bsky/interactions';
import { applyAction } from '@/api/cache';
import { bskyPost } from './fixtures/bsky-agent';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe('applyAction', () => {
  it('likes and unlikes optimistically, clearing the record uri', () => {
    const post = bskyPost({ likeCount: 3 });
    const liked = applyAction(post, 'favourite', true);
    expect(liked.viewer.liked).toBe(true);
    expect(liked.counts.likes).toBe(4);

    const withUri = { ...liked, viewer: { ...liked.viewer, likeUri: 'at://like/1' } };
    const unliked = applyAction(withUri, 'favourite', false);
    expect(unliked.viewer).toMatchObject({ liked: false, likeUri: undefined });
    expect(unliked.counts.likes).toBe(3);
  });

  it('reposts and unreposts, never going below zero', () => {
    const post = bskyPost({ repostCount: 0 });
    expect(applyAction(post, 'reblog', true).counts.reposts).toBe(1);
    const undone = applyAction(post, 'reblog', false);
    expect(undone.counts.reposts).toBe(0);
    expect(undone.viewer.repostUri).toBeUndefined();
  });
});

describe('runToggle', () => {
  it('deletes the record created by an earlier in-flight like', async () => {
    const post = bskyPost();
    const created = deferred<{ uri: string; cid: string }>();
    const agent = {
      like: jest.fn(() => created.promise),
      deleteLike: jest.fn(async () => undefined),
    } as unknown as Agent;

    const first = reserveToggle(post, 'favourite');
    const likeStep = runToggle(agent, post, 'favourite', first);
    const second = reserveToggle(post, 'favourite');
    const unlikeStep = runToggle(agent, post, 'favourite', second);

    expect([first, second]).toEqual([true, false]);
    expect(agent.deleteLike).not.toHaveBeenCalled();

    created.resolve({ uri: 'at://did:plc:me/app.bsky.feed.like/1', cid: 'c' });
    await expect(likeStep).resolves.toBe('at://did:plc:me/app.bsky.feed.like/1');
    await unlikeStep;

    expect(agent.like).toHaveBeenCalledTimes(1);
    expect(agent.like).toHaveBeenCalledWith(post.uri, post.cid);
    expect(agent.deleteLike).toHaveBeenCalledWith('at://did:plc:me/app.bsky.feed.like/1');
  });

  it('ends liked after like, unlike, like in quick succession', async () => {
    const post = bskyPost({ uri: 'at://did:plc:author/app.bsky.feed.post/rapid' });
    let n = 0;
    const agent = {
      like: jest.fn(async () => ({ uri: `at://like/${++n}`, cid: 'c' })),
      deleteLike: jest.fn(async () => undefined),
    } as unknown as Agent;

    const steps = [true, false, true].map(() => {
      const active = reserveToggle(post, 'favourite');
      return runToggle(agent, post, 'favourite', active);
    });
    const results = await Promise.all(steps);

    expect(agent.like).toHaveBeenCalledTimes(2);
    expect(agent.deleteLike).toHaveBeenCalledTimes(1);
    expect(agent.deleteLike).toHaveBeenCalledWith('at://like/1');
    expect(results.at(-1)).toBe('at://like/2');
  });

  it('starts from the viewer state and unreposts with the stored uri', async () => {
    const post = bskyPost(
      { uri: 'at://did:plc:author/app.bsky.feed.post/reposted', viewer: { repost: 'at://repost/9' } },
    );
    const agent = { deleteRepost: jest.fn(async () => undefined) } as unknown as Agent;

    const active = reserveToggle(post, 'reblog');
    expect(active).toBe(false);
    await expect(runToggle(agent, post, 'reblog', active)).resolves.toBeUndefined();
    expect(agent.deleteRepost).toHaveBeenCalledWith('at://repost/9');
  });

  it('recovers after a failed step', async () => {
    const post = bskyPost({ uri: 'at://did:plc:author/app.bsky.feed.post/fail' });
    const agent = {
      like: jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ uri: 'at://like/ok', cid: 'c' }),
    } as unknown as Agent;

    const failed = runToggle(agent, post, 'favourite', reserveToggle(post, 'favourite'));
    await expect(failed).rejects.toThrow('offline');
    const retried = runToggle(agent, post, 'favourite', reserveToggle(post, 'favourite'));
    await expect(retried).resolves.toBe('at://like/ok');
  });
});
