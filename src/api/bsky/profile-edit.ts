import { RichText, type Agent } from '@atproto/api';

import { describeBskyError } from '@/auth/bsky-errors';
import { t } from '@/i18n';

import type { EditableProfile, ProfileEdit } from '../backend/types';
import { fileBytes } from '../local-file';
import { compress } from './post';

const NAME_LIMIT = 64;
const BIO_LIMIT = 256;

export async function bskyEditableProfile(agent: Agent): Promise<EditableProfile> {
  const { data } = await agent.getProfile({ actor: agent.assertDid });
  return {
    displayName: data.displayName ?? '',
    note: data.description ?? '',
    avatar: data.avatar ?? '',
    header: data.banner,
    locked: false,
    bot: false,
    fields: [],
  };
}

async function uploadBlob(agent: Agent, uri: string) {
  const { uri: file } = await compress(uri);
  const { data } = await agent.com.atproto.repo.uploadBlob(await fileBytes(file), { encoding: 'image/jpeg' });
  return data.blob;
}

export async function bskyUpdateProfile(agent: Agent, { displayName, note, avatarUri, headerUri }: ProfileEdit) {
  if (new RichText({ text: displayName }).graphemeLength > NAME_LIMIT) throw new Error(t('profile.editProfile.nameTooLong', { max: NAME_LIMIT }));
  if (new RichText({ text: note }).graphemeLength > BIO_LIMIT) throw new Error(t('profile.editProfile.bioTooLong', { max: BIO_LIMIT }));
  try {
    const avatar = avatarUri ? await uploadBlob(agent, avatarUri) : undefined;
    const banner = headerUri ? await uploadBlob(agent, headerUri) : undefined;
    await agent.upsertProfile((existing) => ({
      ...existing,
      displayName,
      description: note,
      ...(avatar && { avatar }),
      ...(banner && { banner }),
    }));
  } catch (error) {
    throw describeBskyError(error, { server: '' });
  }
}

export async function bskySetPinned(agent: Agent, post: { uri: string; cid: string }, pinned: boolean) {
  await agent.upsertProfile((existing) => {
    const next = { ...existing };
    if (pinned) next.pinnedPost = { uri: post.uri, cid: post.cid };
    else delete next.pinnedPost;
    return next;
  });
}
