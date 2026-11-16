import { useIsFocused, useNavigation } from 'expo-router';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { createStreamingAPIClient } from 'masto';
import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';

import { useAccountScope, useApSession } from '@/auth/session';
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
import { reachesTop } from '../gaps';
import { invalidateInfinite } from '../pagination';
import { useCacheRestoring } from '../persist';
import { pollingFallback } from '../polling-fallback';
import { singleFlight } from '../single-flight';

const POLL_INTERVAL = 60_000;
const CONNECT_GRACE = 10_000;

const newestFirst = (a: Post, b: Post) => (isNewer(a.cursor, b.cursor) ? -1 : 1);

type StreamingClient = ReturnType<typeof createStreamingAPIClient>;

export function openStream<E>(
  streamingApiUrl: string,
  token: string,
  subscribe: (client: StreamingClient) => AsyncIterable<E> & { unsubscribe: () => void },
  onEvent: (event: E) => void,
  onOpenChange?: (open: boolean) => void,
  onReconnect?: () => void,
) {
  // masto retries forever without surfacing it, so the socket itself reports each open and close.
  let opened = false;
  class ObservedWebSocket extends WebSocket {
    constructor(...args: ConstructorParameters<typeof WebSocket>) {
      super(...args);
      this.addEventListener('open', () => {
        onOpenChange?.(true);
        if (opened) onReconnect?.();
        opened = true;
      });
      this.addEventListener('close', () => onOpenChange?.(false));
    }
  }
  const client = createStreamingAPIClient({
    streamingApiUrl,
    accessToken: token,
    retry: true,
    implementation: ObservedWebSocket,
  });
  const subscription = subscribe(client);
  let stopped = false;

  (async () => {
    for await (const event of subscription) {
      if (stopped) break;
      onEvent(event);
    }
  })().catch(() => onOpenChange?.(false));

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

// A column scrolled out of view horizontally provides false; everywhere else a timeline is in view.
export const ColumnVisibleContext = createContext(true);

// The home timeline keeps live updates while its tab is in the background, but not off-screen in columns mode.
export function useTimelineLive(timeline: Timeline) {
  const focused = useTimelineFocused(timeline);
  const visible = useContext(ColumnVisibleContext);
  return visible && (focused || timeline === 'home');
}

// Timelines don't refetch on focus, so opening the stream also fetches what it missed.
export function useTimelineStream(timeline: Timeline) {
  const token = useApSession()?.token;
  const account = useAccountScope();
  const { data: instance } = useInstance();
  const masto = useMasto();
  const queryClient = useQueryClient();
  const restoring = useCacheRestoring();
  const appActive = useAppActive();
  const live = useTimelineLive(timeline);
  const active = appActive && live;
  const streamingApiUrl = instance?.configuration.urls.streaming;
  const id = idOf(timeline);

  useEffect(() => {
    // A restored list is only caught up by this effect, so it must wait for the restore to finish.
    if (!active || !instance || !token || restoring) return;
    let stopped = false;

    if (timeline === 'home') void invalidateInfinite(queryClient, keys.notifications(account));

    const fetchMissed = singleFlight(async () => {
      const top = queryClient.getQueryData<InfiniteData<Post[]>>(keys.timeline(account, timeline))?.pages[0]?.[0]?.cursor;
      if (!top) return;
      try {
        const missed = await fetchTimelinePage(requireMasto(masto).v1.timelines, timeline, {});
        if (stopped) return;
        const data = queryClient.getQueryData<InfiniteData<Post[]>>(keys.timeline(account, timeline));
        const cached = new Set(data?.pages.flat().map((s) => s.cursor));
        const unseen = missed.filter((s) => isNewer(s.cursor, top) && !cached.has(s.cursor));
        // A newest page that does not reach the cached top leaves a hole; showing it inserts a gap marker.
        if (!reachesTop(missed, top)) markOverflowed(id);
        const waiting = getPending(id);
        const known = new Set(waiting.map((s) => s.cursor));
        setPending(id, [...waiting, ...unseen.filter((s) => !known.has(s.cursor))].sort(newestFirst));
        fallback.setFailed(false);
      } catch (error) {
        if (stopped) return;
        // Live posts would otherwise merge above a stale top with no gap marker.
        console.warn('Timeline catch-up failed', error);
        markOverflowed(id);
        fallback.setFailed(true);
      }
    });

    const fallback = pollingFallback(fetchMissed, POLL_INTERVAL, streamingApiUrl ? CONNECT_GRACE : POLL_INTERVAL);

    fetchMissed();

    if (!streamingApiUrl) {
      return () => {
        stopped = true;
        fallback.stop();
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
            removeStatus(queryClient, account, event.payload);
            setPending(id, getPending(id).filter((s) => s.cursor !== event.payload));
            break;
          case 'status.update':
            patchStatus(queryClient, account, event.payload.id, () => toPost(event.payload));
            break;
          case 'notification':
            invalidateInfinite(queryClient, keys.notifications(account));
            queryClient.invalidateQueries({ queryKey: keys.latestNotification(account) });
            break;
        }
      },
      fallback.setOpen,
      fetchMissed,
    );

    return () => {
      stopped = true;
      fallback.stop();
      close();
    };
    // `timeline` is identified by `id`; a new object for the same tag must not reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamingApiUrl, instance, token, active, restoring, id, account, queryClient, masto]);
}
