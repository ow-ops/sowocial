import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultKeybindingsHandlerIgnore, tinykeys } from 'tinykeys';

import { setHomeSource, useHomeSources, type HomeSource } from '@/api/home-sources';
import { useSession } from '@/auth/session';
import { useStatusAction, type StatusAction } from '@/api/statuses';

import type { ShortcutAction } from './definitions';
import { focusedStatus, moveFocus, useFocusStore } from './focus-store';
import { buildBindings, isPlainBodyTarget } from './keymap';

export function ShortcutsHost() {
  const { session } = useSession();
  return session ? <Bindings /> : null;
}

function Bindings() {
  const router = useRouter();
  const { t } = useTranslation();
  const { mutate } = useStatusAction();
  const { accounts, source, mixed: showMixed } = useHomeSources();
  const pathname = usePathname();
  const mixed = !!accounts;

  useEffect(() => {
    const withStatus = (run: (status: NonNullable<ReturnType<typeof focusedStatus>>) => void) => () => {
      const focused = focusedStatus();
      if (focused) run(focused);
    };
    const toggle = (action: StatusAction) =>
      withStatus((status) => {
        if (action === 'reblog' && status.protocol === 'ap' && status.visibility !== 'public' && status.visibility !== 'unlisted') return;
        if (action === 'bookmark' && !status.capabilities.bookmark) return;
        mutate({ status, action });
      });
    const go = (href: '/home' | '/notifications' | '/local' | '/search' | '/me') => () => router.navigate(href);

    const handlers: Record<ShortcutAction, () => void> = {
      next: () => moveFocus(1),
      previous: () => moveFocus(-1),
      open: withStatus((status) => useFocusStore.getState().list?.open(status)),
      reply: withStatus((status) => router.push({ pathname: '/compose', params: { replyTo: status.id } })),
      like: toggle('favourite'),
      boost: toggle('reblog'),
      bookmark: toggle('bookmark'),
      compose: () => router.push('/compose'),
      cycleSource: () => {
        if (!mixed || pathname !== '/home') return;
        const order: HomeSource[] = showMixed ? ['ap', 'bsky', 'mixed'] : ['ap', 'bsky'];
        setHomeSource(order[(order.indexOf(source) + 1) % order.length]);
      },
      search: () => {
        router.navigate('/search');
        const placeholder = t('timeline.search.placeholder');
        setTimeout(() => {
          [...document.querySelectorAll('input')].find((input) => input.placeholder === placeholder)?.focus();
        }, 100);
      },
      top: () => useFocusStore.getState().list?.top(),
      help: () => router.push('/shortcuts'),
      back: () => {
        if (router.canGoBack()) router.back();
      },
      goHome: go('/home'),
      goNotifications: go('/notifications'),
      goLocal: go('/local'),
      goSearch: go('/search'),
      goProfile: go('/me'),
    };

    return tinykeys(window, buildBindings(handlers), {
      // A focused card already handles Enter itself; only act when nothing is focused.
      ignore: (event) => defaultKeybindingsHandlerIgnore(event) || (event.key === 'Enter' && !isPlainBodyTarget(event)),
    });
  }, [mutate, router, t, mixed, showMixed, pathname, source]);

  return null;
}
