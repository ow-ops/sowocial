import { useRecyclingState } from '@shopify/flash-list';
import { Platform } from 'react-native';

import { useLinkedPost } from '@/api/statuses';
import { useAccountScope } from '@/auth/session';
import type { Post } from '@/model/post';
import { usePref } from '@/prefs/store';

// What a post shows beyond its own fields: the post it quotes and whether its warning and media are open.
// Sensitive media always stays hidden on iOS to keep the App Store age rating.
export function usePostView(post: Post) {
  const scope = useAccountScope();
  const expandWarnings = usePref('alwaysExpandWarnings');
  const showSensitive = usePref('alwaysShowSensitive');
  const linked = useLinkedPost(post.quoteLink, post.accountKey ?? scope, post.id);
  const warningOpen = expandWarnings && post.capabilities.autoReveal;
  const [revealed, setRevealed] = useRecyclingState(warningOpen, [post.key, warningOpen]);
  return {
    quote: post.quote ?? linked.data ?? undefined,
    resolving: linked.isLoading,
    revealed,
    setRevealed,
    sensitiveShown: showSensitive && post.capabilities.autoReveal && Platform.OS !== 'ios',
  };
}

export type PostView = ReturnType<typeof usePostView>;
