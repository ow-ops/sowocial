import { useLocalSearchParams } from 'expo-router';
import type { mastodon } from 'masto';

import { ActingAccount } from '@/auth/session';
import { Composer } from '@/components/composer';

export default function ComposeScreen() {
  const params = useLocalSearchParams<{
    replyTo?: string;
    edit?: string;
    redraft?: string;
    quote?: string;
    visibility?: mastodon.v1.StatusVisibility;
    text?: string;
    account?: string;
  }>();
  const { account, ...rest } = params;
  return (
    <ActingAccount account={account}>
      <Composer {...rest} />
    </ActingAccount>
  );
}
