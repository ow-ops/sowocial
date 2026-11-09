import { useIsFocused, useNavigation } from 'expo-router';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { createStreamingAPIClient } from 'masto';
import { useEffect, useSyncExternalStore } from 'react';

import { useApSession } from '@/auth/session';
import { useAppActive } from '@/hooks/use-app-active';
import { toPost } from '@/model/adapters/ap';
import type { Post } from '@/model/post';

import { patchStatus, removeStatus } from '../cache';
import { keys, type Timeline } from '../keys';
import { useMasto, requireMasto } from '../client';
import { useInstance } from './instance';
import { isNewer } from './markers';
import { getPending, idOf, markOverflowed, setPending } from '../pending';
import { fetchTimelinePage } from './backend';
import { invalidateInfinite, PAGE_SIZE } from '../pagination';

const POLL_INTERVAL = 60_000;

const newestFirst = (a: Post, b: Post) => (isNewer(a.cursor, b.cursor) ? -1 : 1);

type StreamingClient = ReturnType<typeof createStreamingAPIClient>;

export function openStream<E>(
  streamingApiUrl: string,
  token: string,
  subscribe: (client: StreamingClient) => AsyncIterable<E> & { unsubscribe: () => void },
  onEvent: (event: E) => void,
  onError?: () => void,
) {
  const client = createStreamingAPIClient({ streamingApiUrl, accessToken: token, retry: true });
  const subscription = subscribe(client);
  let stopped = false;

  (async () => {
    for await (const event of subscription) {
      if (stopped) break;
      onEvent(event);
    }
  })().catch(() => onError?.());

  return () => {
    stopped = true;
    subscription.unsubscribe();
    client.close();
  };
}

// Tab selection, not screen focus: a pushed post leaves the tab navigator's state unchanged.
export function useTimelineFocused(timeline: Timeline) {
  const navigation = useNavigation();
  const screenFocused = useIsFocused();
  const tab = timeline === 'home' || timeline === 'local' ? timeline : null;
  const tabs = navigation.getParent();
  const tabFocused = useSyncExternalStore(
    (onChange) => tabs?.addListener('state', onChange) ?? (() => {}),
    () => {
      const state = tabs?.getState();
      return state?.routes[state.index]?.name === tab;
    },
  );
  return tab ? tabFocused : screenFocused;
}

// Timelines don't refetch on focus, so opening the stream also fetches what it missed.
export function useTimelineStream(timeline: Timeline) {
  const token = useApSession()?.token;
  const { data: instance } = useInstance();
  const masto = useMasto();
  const queryClient = useQueryClient();
  const appActive = useAppActive();
  const focused = useTimelineFocused(timeline);
  const active = appActive && (focused || timeline === 'home');
  const streamingApiUrl = instance?.configuration.urls.streaming;
  const id = idOf(timeline);

  useEffect(() => {
    if (!active || !instance || !token) return;
    let stopped = false;

    if (timeline === 'home') void invalidateInfinite(queryClient, keys.notifications);

    const fetchMissed = () => {
      const top = queryClient.getQueryData<InfiniteData<Post[]>>(keys.timeline(timeline))?.pages[0]?.[0]?.cursor;
      if (!top) return;
      Promise.resolve(fetchTimelinePage(requireMasto(masto).v1.timelines, timeline, { minId: top }))
        .then((missed) => {
          if (stopped) return;
          const data = queryClient.getQueryData<InfiniteData<Post[]>>(keys.timeline(timeline));
          const cached = new Set(data?.pages.flat().map((s) => s.cursor));
          const unseen = missed.filter((s) => !cached.has(s.cursor));
          // A full page means older missed posts may remain.
          if (missed.length >= PAGE_SIZE) markOverflowed(id);
          const waiting = getPending(id);
          const known = new Set(waiting.map((s) => s.cursor));
          setPending(id, [...waiting, ...unseen.filter((s) => !known.has(s.cursor))].sort(newestFirst));
        })
        .catch(() => {});
    };

    fetchMissed();

    let timer: ReturnType<typeof setInterval> | undefined;
    const startPolling = () => {
      timer ??= setInterval(fetchMissed, POLL_INTERVAL);
    };

    if (!streamingApiUrl) {
      startPolling();
      return () => {
        stopped = true;
        clearInterval(timer);
      };
    }

    const close = openStream(
      streamingApiUrl,
      token,
      (client) =>
        timeline === 'home'
          ? client.user.subscribe()
          : timeline === 'local'
            ? client.public.local.subscribe()
            : timeline === 'public'
              ? client.public.subscribe()
              : client.hashtag.subscribe({ tag: timeline.tag }),
      (event) => {
        switch (event.event) {
          case 'update': {
            const waiting = getPending(id);
            if (!waiting.some((s) => s.cursor === event.payload.id)) setPending(id, [toPost(event.payload), ...waiting]);
            break;
          }
          case 'delete':
            removeStatus(queryClient, event.payload);
            setPending(id, getPending(id).filter((s) => s.cursor !== event.payload));
            break;
          case 'status.update':
            patchStatus(queryClient, event.payload.id, () => toPost(event.payload));
            break;
          case 'notification':
            invalidateInfinite(queryClient, keys.notifications);
            queryClient.invalidateQueries({ queryKey: keys.latestNotification });
            break;
        }
      },
      startPolling,
    );

    return () => {
      stopped = true;
      clearInterval(timer);
      close();
    };
    // `timeline` is identified by `id`; a new object for the same tag must not reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamingApiUrl, instance, token, active, id, queryClient, masto]);
}
