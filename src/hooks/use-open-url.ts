import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { AccessibilityInfo } from 'react-native';

import { useCapabilities } from '@/api/backend';
import { useResolveUrl } from '@/api/search';
import { useApSession } from '@/auth/session';
import { t } from '@/i18n';
import { linkResolving } from '@/utils/link-resolving';
import { isWebUrl, localStatusId, looksLikeFediverseUrl } from '@/utils/links';

const RESOLVE_TIMEOUT = 5000;

export function useOpenUrl() {
  const { resolveLinks } = useCapabilities();
  const instance = useApSession()?.instance;
  const resolve = useResolveUrl();

  return async (url: string, forceResolve = false) => {
    if (!isWebUrl(url)) return;
    if (!resolveLinks) return void WebBrowser.openBrowserAsync(url);

    const localId = instance && localStatusId(url, instance);
    if (localId) return router.push(`/post/${localId}`);

    if (forceResolve || looksLikeFediverseUrl(url)) {
      const token = linkResolving.start();
      if (token === null) return;
      AccessibilityInfo.announceForAccessibility(t('timeline.openingLink'));
      const found = await resolve(url, RESOLVE_TIMEOUT).catch(() => null);
      if (!linkResolving.finish(token)) return;
      if (found) return router.push(`/${found.type === 'status' ? 'post' : 'account'}/${found.id}`);
    }
    WebBrowser.openBrowserAsync(url);
  };
}
