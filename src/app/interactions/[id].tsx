import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useInteractionList } from '@/api/accounts';
import { ActingAccount } from '@/auth/session';
import { AccountRow } from '@/components/account-row';
import { InfiniteList } from '@/components/infinite-list';

export default function InteractionsScreen() {
  const { id, kind, account } = useLocalSearchParams<{ id: string; kind: string; account?: string }>();
  return (
    <ActingAccount account={account}>
      <InteractionList id={id} likes={kind !== 'reposts'} />
    </ActingAccount>
  );
}

function InteractionList({ id, likes }: { id: string; likes: boolean }) {
  const { t } = useTranslation();
  return (
    <InfiniteList
      title={likes ? t('status.interactions.likes') : t('status.interactions.reposts')}
      query={useInteractionList(id, likes ? 'likes' : 'reposts')}
      keyExtractor={(a) => a.id}
      renderItem={(a) => <AccountRow account={a} />}
      emptyText={likes ? t('status.interactions.noLikes') : t('status.interactions.noReposts')}
    />
  );
}
