import { useMutation, useQuery } from '@tanstack/react-query';
import { MastoHttpError } from 'masto';
import { getLocales } from 'expo-localization';
import { useMemo } from 'react';
import { createStore, useStore } from 'zustand';

import { accountKey, useAuthedSession } from '@/auth/session';
import { t } from '@/i18n';
import type { Post } from '@/model/post';
import { needsTranslation, translatedPost, type PostTranslation } from '@/model/translate';
import { showError } from '@/utils/toast';

import { handlesError } from '../mutation-meta';
import { getMasto, isForeign } from '../clients';
import { keys, scoped } from '../keys';

export const userLanguage = () => getLocales()[0]?.languageCode ?? 'en';

const store = createStore<{ shown: Record<string, PostTranslation> }>(() => ({ shown: {} }));

export const hideTranslation = (uid: string) =>
  store.setState(({ shown: { [uid]: _, ...rest } }) => ({ shown: rest }));

export const useShownTranslation = (uid: string) => useStore(store, (s) => s.shown[uid]);

export function useTranslatedPost(post: Post) {
  const translation = useShownTranslation(post.uid);
  return useMemo(() => (translation ? translatedPost(post, translation) : post), [post, translation]);
}

export function useCanTranslate(post: Post) {
  const activeKey = accountKey(useAuthedSession());
  const account = isForeign(post, activeKey) ? post.accountKey : undefined;
  const { data } = useQuery({
    queryKey: scoped(keys.instance, account),
    queryFn: () => getMasto(account).v2.instance.fetch(),
    staleTime: Infinity,
    enabled: post.protocol === 'ap',
  });
  return post.protocol === 'ap' && !!data?.configuration.translation.enabled && needsTranslation(post.language, userLanguage());
}

const isNotAvailable = (error: unknown) =>
  error instanceof MastoHttpError && (error.statusCode === 404 || error.statusCode === 501);

export function useTranslatePost(account?: string) {
  return useMutation({
    meta: handlesError,
    mutationFn: async (post: Post) =>
      (await getMasto(account).v1.statuses.$select(post.id).translate({ lang: userLanguage() })) as unknown as PostTranslation,
    onSuccess: (translation, post) => store.setState((s) => ({ shown: { ...s.shown, [post.uid]: translation } })),
    onError: (error) =>
      showError(t('status.translate.failed'), isNotAvailable(error) ? t('status.translate.unavailable') : error.message),
  });
}
