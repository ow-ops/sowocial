import { Platform } from 'react-native';

import type { Post } from '@/model/post';

import { usePref } from './store';

// Bluesky labels reach the post as a content warning or sensitive flag, so only fediverse posts are auto-revealed.
// Sensitive media always stays hidden on iOS to keep the App Store age rating.
export function useAutoReveal(status: Post) {
  const warnings = usePref('alwaysExpandWarnings');
  const sensitive = usePref('alwaysShowSensitive');
  const ap = status.protocol === 'ap';
  return { warning: warnings && ap, sensitive: sensitive && ap && Platform.OS !== 'ios' };
}
