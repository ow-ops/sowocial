import type { Agent } from '@atproto/api';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { t } from '@/i18n';
import type { BskyPost } from '@/model/post';

import {
  buildEmbed,
  buildLabels,
  OPEN_INTERACTIONS,
  postgateRules,
  replyRefs,
  strongRef,
  threadgateAllow,
  type PostImage,
  type PostInteractions,
  type SelfLabel,
} from './compose';
import { detectRichText } from './richtext';
import { uploadBskyVideo, type PostVideo, type VideoDraft, type VideoProgress } from './video';
import type { MediaDraft } from '../ap/upload';
import type { ReplyRef } from '../backend/types';
import { fileBytes, fileSize, uploadBinary } from '../local-file';

const MAX_BYTES = 950_000;
const MAX_WIDTH = 2000;
const MIN_WIDTH = 400;
const QUALITIES = [0.9, 0.75, 0.6, 0.45];

export async function compress(uri: string) {
  let source = await ImageManipulator.manipulate(uri, { maxWidth: MAX_WIDTH }).renderAsync();
  for (;;) {
    for (const compress of QUALITIES) {
      const result = await source.saveAsync({ compress, format: SaveFormat.JPEG });
      if ((await fileSize(result.uri)) <= MAX_BYTES) return result;
    }
    if (source.width <= MIN_WIDTH) throw new Error(t('compose.upload.tooLarge'));
    source = await ImageManipulator.manipulate(source).resize({ width: Math.round(source.width * 0.75) }).renderAsync();
  }
}

async function uploadImage(agent: Agent, { uri, description }: MediaDraft, signal: AbortSignal): Promise<PostImage> {
  const { uri: file, width, height } = await compress(uri);
  const bytes = await fileBytes(file);
  const { data } = await agent.com.atproto.repo.uploadBlob(bytes, { encoding: 'image/jpeg', signal });
  return { image: data.blob, alt: description, aspectRatio: { width, height } };
}

export type BskyPostParams = {
  text: string;
  parent?: BskyPost;
  replyRef?: ReplyRef;
  quote?: BskyPost;
  media: MediaDraft[];
  video?: VideoDraft;
  pds?: string;
  onVideoProgress?: (progress: VideoProgress) => void;
  language?: string;
  label?: SelfLabel;
  interactions?: PostInteractions;
};

async function applyInteractions(agent: Agent, uri: string, { replies, quotes }: PostInteractions) {
  const repo = agent.assertDid;
  const rkey = uri.slice(uri.lastIndexOf('/') + 1);
  const createdAt = new Date().toISOString();
  const allow = threadgateAllow(replies);
  const embeddingRules = postgateRules(quotes);
  if (allow) await agent.app.bsky.feed.threadgate.create({ repo, rkey }, { post: uri, allow, createdAt });
  if (embeddingRules) await agent.app.bsky.feed.postgate.create({ repo, rkey }, { post: uri, embeddingRules, createdAt });
}

export async function createBskyPost(agent: Agent, params: BskyPostParams, signal: AbortSignal) {
  const { text, parent, replyRef, quote, media, video, pds, onVideoProgress, language, label, interactions = OPEN_INTERACTIONS } = params;
  const [rt, images, uploadedVideo] = await Promise.all([
    detectRichText(agent, text.trim()),
    Promise.all(media.map((m) => uploadImage(agent, m, signal))),
    video && pds
      ? uploadBskyVideo({ agent, pds, video, upload: uploadBinary, signal, onProgress: onVideoProgress })
      : Promise.resolve<PostVideo | undefined>(undefined),
  ]);
  const created = await agent.post({
    text: rt.text,
    facets: rt.facets,
    reply: replyRef ?? (parent && replyRefs(parent)),
    embed: buildEmbed(quote && strongRef(quote), images, uploadedVideo),
    langs: language ? [language] : undefined,
    labels: images.length || uploadedVideo ? buildLabels(label) : undefined,
  });
  try {
    await applyInteractions(agent, created.uri, { ...interactions, replies: parent || replyRef ? 'everyone' : interactions.replies });
  } catch (error) {
    await agent.deletePost(created.uri).catch(() => undefined);
    throw error;
  }
  return created;
}
