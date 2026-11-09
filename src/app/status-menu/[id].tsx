import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useStatus } from '@/api/statuses';
import { ActingAccount } from '@/auth/session';
import { useStatusActions } from '@/components/menu-actions';
import { MenuSections } from '@/components/menu-sections';
import { SettingsScreen } from '@/components/settings';
import type { Post } from '@/model/post';

function StatusSheet({ status }: { status: Post }) {
  const { t } = useTranslation();
  const groups = useStatusActions(status, { sheet: true });
  return (
    <SettingsScreen title={t('common.nav.post')}>
      <MenuSections
        groups={groups}
        titles={{
          own: t('timeline.statusMenu.yourPost'),
          post: t('timeline.statusMenu.post'),
          moderation: status.author.displayName,
        }}
      />
    </SettingsScreen>
  );
}

function StatusMenuContent({ id }: { id: string }) {
  const { data: status } = useStatus(id);
  return status ? <StatusSheet status={status} /> : null;
}

export default function StatusMenu() {
  const { id, account } = useLocalSearchParams<{ id: string; account?: string }>();
  return (
    <ActingAccount account={account}>
      <StatusMenuContent id={id} />
    </ActingAccount>
  );
}
