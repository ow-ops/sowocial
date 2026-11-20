import { useIsFocused, useNavigation } from 'expo-router';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { createStreamingAPIClient } from 'masto';
import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';

import { useAccountScope, useApSession } from '@/auth/session';
import { useAppActive } from '@/hooks/use-app-active';
import { toPost } from '@/model/adapters/ap';
import type { Page } from '@/model/page';
import type { Post } from '@/model/post';

import { applyEdits, patchStatus, removeStatus } from '../cache';
import { keys, timelineId, type Timeline } from '../keys';
import { getMasto } from '../clients';
import { useInstance } from './instance';
import { isNewer } from './markers';
import { getPending, markOverflowed, setPending } from '../pending';
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

// React Native's WebSocket takes a third options argument the DOM type leaves out.
const NativeWebSocket = WebSocket as unknown as new (
  url: string,
  protocols?: string | string[],
  options?: { headers: Record<string, string> },
) => WebSocket;

// GoToSocial advertises wss:// even when the server itself runs on plain http.
export function streamingUrl(advertised: string | undefined, instance: string | undefined) {
  return advertised && instance?.startsWith('http://') ? advertised.replace(/^wss:/, 'ws:') : advertised;
}

export function openStream<E>(
  streamingApiUrl: string,
  token: string,
  subscribe: (client: StreamingClient) => AsyncIterable<E> & { unsubscribe: () => void },
  onEvent: (event: E) => void,
  onOpenChange?: (open: boolean) => void,
  // Also runs on the first open, to catch posts made before the socket opened.
  onConnect?: () => void,
) {
  // masto retries forever without surfacing it, so the socket itself reports each open and close.
  class ObservedWebSocket extends NativeWebSocket {
    // masto passes a URL object, which iOS's native socket module rejects.
    // GoToSocial answers 418 to a request without a User-Agent, and iOS sockets send none.
    constructor(url: string | URL, protocols?: string | string[]) {
      super(String(url), protocols, { headers: { 'User-Agent': 'sowocial' } });
      this.addEventListener('open', () => {
        onOpenChange?.(true);
        onConnect?.();
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
function useTimelineFocused(timeline: Timeline) {
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
  const session = useApSession();
  const token = session?.token;
  const account = useAccountScope();
  const { data: instance } = useInstance();
  const queryClient = useQueryClient();
  const restoring = useCacheRestoring();
  const appActive = useAppActive();
  const live = useTimelineLive(timeline);
  const active = appActive && live;
  const streamingApiUrl = streamingUrl(instance?.configuration.urls.streaming, session?.instance);
  const id = timelineId(timeline);

  useEffect(() => {
    // A restored list is only caught up by this effect, so it must wait for the restore to finish.
    if (!active || !instance || !token || restoring) return;
    let stopped = false;
    const queryKey = keys.timeline(account, timeline);

    if (timeline === 'home') void invalidateInfinite(queryClient, keys.notifications(account));

    const fetchMissed = singleFlight(async () => {
      const top = queryClient.getQueryData<InfiniteData<Page<Post>>>(queryKey)?.pages[0]?.items[0]?.cursor;
      if (!top) return;
      try {
        const missed = await fetchTimelinePage(getMasto(account).v1.timelines, timeline, {});
        if (stopped) return;
        const data = queryClient.getQueryData<InfiniteData<Page<Post>>>(queryKey);
        const cachedPosts = data?.pages.flatMap((page) => page.items) ?? [];
        applyEdits(queryClient, account, cachedPosts, missed);
        const cached = new Set(cachedPosts.map((s) => s.cursor));
        const unseen = missed.filter((s) => isNewer(s.cursor, top) && !cached.has(s.cursor));
        // A newest page that does not reach the cached top leaves a hole; showing it inserts a gap marker.
        if (!reachesTop(missed, top)) markOverflowed(queryKey);
        const waiting = getPending(queryKey);
        const known = new Set(waiting.map((s) => s.cursor));
        setPending(queryKey, [...waiting, ...unseen.filter((s) => !known.has(s.cursor))].sort(newestFirst));
        fallback.setFailed(false);
      } catch (error) {
        if (stopped) return;
        // Live posts would otherwise merge above a stale top with no gap marker.
        console.warn('Timeline catch-up failed', error);
        markOverflowed(queryKey);
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
            const waiting = getPending(queryKey);
            if (!waiting.some((s) => s.cursor === event.payload.id)) setPending(queryKey, [toPost(event.payload), ...waiting]);
            break;
          }
          case 'delete':
            removeStatus(queryClient, account, event.payload);
            setPending(queryKey, getPending(queryKey).filter((s) => s.cursor !== event.payload));
            break;
          case 'status.update':
            patchStatus(queryClient, account, event.payload.id, (p) => ({ ...toPost(event.payload), viewer: p.viewer }));
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
  }, [streamingApiUrl, instance, token, active, restoring, id, account, queryClient]);
}
