import type { Agent } from '@atproto/api';

import type { BskyPost } from '@/model/post';

import type { StatusAction } from '../backend/types';
import { actionFields } from '../cache';

type Interaction = Extract<StatusAction, 'favourite' | 'reblog'>;

type Slot = { tail: Promise<unknown>; pending: number; target: boolean; uri?: string };

const slots = new Map<string, Slot>();

const slotKey = (post: BskyPost, action: Interaction) => `${action}:${post.uri}`;

export function reserveToggle(post: BskyPost, action: Interaction) {
  const { flag, uri } = actionFields[action];
  const key = slotKey(post, action);
  let slot = slots.get(key);
  if (!slot) {
    slot = { tail: Promise.resolve(), pending: 0, target: post.viewer[flag] ?? false, uri: post.viewer[uri] };
    slots.set(key, slot);
  }
  slot.pending++;
  slot.target = !slot.target;
  return slot.target;
}

async function create(agent: Agent, post: BskyPost, action: Interaction) {
  const { uri } = action === 'favourite' ? await agent.like(post.uri, post.cid) : await agent.repost(post.uri, post.cid);
  return uri;
}

function remove(agent: Agent, action: Interaction, uri: string) {
  return action === 'favourite' ? agent.deleteLike(uri) : agent.deleteRepost(uri);
}

export function runToggle(agent: Agent, post: BskyPost, action: Interaction, active: boolean) {
  const key = slotKey(post, action);
  const slot = slots.get(key);
  if (!slot) throw new Error('Toggle was not reserved');

  const step = slot.tail
    .catch(() => undefined)
    .then(async () => {
      if (active && !slot.uri) slot.uri = await create(agent, post, action);
      else if (!active && slot.uri) {
        await remove(agent, action, slot.uri);
        slot.uri = undefined;
      }
      return slot.uri;
    })
    .finally(() => {
      if (--slot.pending === 0) slots.delete(key);
    });
  slot.tail = step;
  return step;
}
