import { useNavigation, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { PostDraft, VideoProgress } from '@/api/backend/draft';
import { missingAlt } from '@/api/compose-alt';
import { nextChain, type Chain } from '@/api/compose-thread';
import { usePostStatus } from '@/api/statuses';
import type { Post } from '@/model/post';
import { getPref } from '@/prefs/store';
import { confirmAction } from '@/utils/dialog';
import type { DraftSegment } from '@/utils/drafts';
import { showError, showToast } from '@/utils/toast';

type Options = {
  owner: string;
  parent?: Post;
  segments: DraftSegment[];
  chain: Chain | undefined;
  draftFor: (segment: DraftSegment, at: Chain | undefined) => PostDraft;
  advance: (remaining: DraftSegment[], at: Chain | undefined) => void;
  focusAlt: (uri: string) => void;
  onSent: () => void;
};

// Posts `segments` in order, each replying to the one before. A segment that went out is dropped from the form by
// `advance`, so a failure leaves exactly the unsent ones to retry.
export function useComposeSend({ owner, parent, segments, chain, draftFor, advance, focusAlt, onSent }: Options) {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const post = usePostStatus();
  const [videoProgress, setVideoProgress] = useState<VideoProgress | null>(null);
  const sending = useRef(false);

  const send = async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      await sendAll();
    } finally {
      sending.current = false;
    }
  };

  const sendAll = async () => {
    let at = chain;
    let firstCreated: string | undefined;
    for (let i = 0; i < segments.length; i++) {
      let outcome;
      try {
        outcome = await post.mutateAsync({ ...draftFor(segments[i], at), onVideoProgress: setVideoProgress });
      } catch (error) {
        showError(
          segments.length > 1 ? t('compose.thread.failed', { number: i + 1, total: segments.length }) : t('compose.submitFailed'),
          error instanceof Error ? error.message : undefined,
        );
        return;
      }
      if (outcome.kind === 'created') firstCreated ??= outcome.id;
      at = nextChain(outcome, at, parent);
      if (i < segments.length - 1) advance(segments.slice(i + 1), at);
    }
    onSent();
    // Cancel can leave the composer while the post is still going out.
    if (navigation.isFocused()) router.back();
    if (firstCreated) {
      const id = firstCreated;
      showToast(t('compose.posted'), {
        label: t('compose.openPost'),
        onClick: () => router.push({ pathname: '/post/[id]', params: { id, account: owner } }),
      });
    }
  };

  const submit = () => {
    const [firstMissing] = getPref('altReminder') ? missingAlt(segments) : [];
    if (firstMissing === undefined) return void send();
    confirmAction(t('compose.altReminder.title'), t('compose.altReminder.postAnyway'), () => void send(), {
      cancelLabel: t('compose.altReminder.add'),
      onCancel: () => focusAlt(firstMissing),
      destructive: false,
    });
  };

  return { submit, pending: post.isPending, error: post.error, videoProgress };
}
