import { router } from 'expo-router';
import { useShareIntentContext, type ShareIntent } from 'expo-share-intent';
import { useEffect } from 'react';

function shareText({ meta, text, webUrl }: ShareIntent) {
  const body = text ?? webUrl ?? '';
  const title = meta?.title?.trim();
  return title && !body.includes(title) ? `${title}\n${body}`.trim() : body.trim();
}

export function useShareToCompose(enabled: boolean) {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  useEffect(() => {
    if (!enabled || !hasShareIntent) return;
    const text = shareText(shareIntent);
    resetShareIntent();
    if (text) router.push({ pathname: '/compose', params: { text } });
  }, [enabled, hasShareIntent, shareIntent, resetShareIntent]);
}
