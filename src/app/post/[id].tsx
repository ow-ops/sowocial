import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { keys } from '@/api/keys';
import { useStatus } from '@/api/statuses';
import { ActingAccount, useAccountScope, useForeignAccount } from '@/auth/session';
import { ThreadView } from '@/components/thread-view';
import { appPostPath } from '@/utils/links';

export default function ThreadScreen() {
  const { t } = useTranslation();
  const { id, account } = useLocalSearchParams<{ id: string; account?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: t('common.nav.post') }} />
      <ActingAccount account={account}>
        <Thread id={id} />
      </ActingAccount>
    </>
  );
}

function Thread({ id }: { id: string }) {
  useShareableAddress(id);
  return <ThreadView id={id} />;
}

// Web only: /post/<id> means nothing to anyone else, so public posts move to their shareable address.
function useShareableAddress(id: string) {
  const queryClient = useQueryClient();
  const scope = useAccountScope();
  const foreign = useForeignAccount();
  const status = useStatus(id).data;
  const shareable =
    Platform.OS === 'web' &&
    !foreign &&
    status?.protocol === 'ap' &&
    (status.visibility === 'public' || status.visibility === 'unlisted');
  const path = shareable ? appPostPath(status.url) : null;

  useEffect(() => {
    if (!path || !status) return;
    queryClient.setQueryData(keys.linkedPost(scope, status.url), status);
    router.replace(path as Href);
  }, [path, status, scope, queryClient]);
}
