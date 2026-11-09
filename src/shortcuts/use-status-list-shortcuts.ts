import type { FlashListRef } from '@shopify/flash-list';
import type { RefObject } from 'react';

import type { Post } from '@/model/post';

export function useStatusListShortcuts(
  _statuses: Post[],
  _listRef: RefObject<FlashListRef<Post> | null>,
  _showNew?: () => void,
) {}
