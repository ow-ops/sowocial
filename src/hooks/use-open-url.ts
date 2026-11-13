import { router } from 'expo-router';
import { AccessibilityInfo } from 'react-native';

import { useCapabilities } from '@/api/backend';
import { useResolveUrl } from '@/api/search';
import { useApSession } from '@/auth/session';
import { t } from '@/i18n';
import { openLink } from '@/utils/open-link';
import { linkResolving } from '@/utils/link-resolving';
import { isWebUrl, localStatusId, routeFor } from '@/utils/links';

const RESOLVE_TIMEOUT = 5000;

export function useOpenUrl() {
  const { resolveLinks } = useCapabilities();
  const instance = useApSession()?.instance;
  const { resolve, resolvesUrl } = useResolveUrl();

  return async (url: string, forceResolve = false) => {
    if (!isWebUrl(url)) return;
    const localId = resolveLinks && instance && localStatusId(url, instance);
    if (localId) return router.push(`/post/${localId}`);

    if (resolvesUrl(url) || (resolveLinks && forceResolve)) {
      const token = linkResolving.start();
      if (token === null) return;
      AccessibilityInfo.announceForAccessibility(t('timeline.openingLink'));
      const found = await resolve(url, RESOLVE_TIMEOUT).catch(() => null);
      if (!linkResolving.finish(token)) return;
      if (found) return router.push(routeFor(found));
    }
    openLink(url);
  };
}
