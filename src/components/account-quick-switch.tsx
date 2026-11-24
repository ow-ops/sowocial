import { router } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { accountKey, useSession } from '@/auth/session';
import type { Session } from '@/auth/types';
import { NativeMenu } from '@/components/native-menu';
import { sessionHandle } from '@/components/source-badge';
import { useColumn } from '@/hooks/use-column';
import { useTheme } from '@/hooks/use-theme';

const ICON: SymbolViewProps['name'] = { ios: 'person.2', android: 'switch_account', web: 'switch_account' };

export function AccountQuickSwitch({
  renderTrigger,
}: {
  renderTrigger: (open: () => void, label: string, icon: SymbolViewProps['name']) => ReactNode;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { rail } = useColumn();
  const { session, sessions, switchAccount } = useSession();
  // The web sidebar already has its own switcher.
  if (!session || sessions.length < 2 || rail) return null;
  const active = accountKey(session);
  const label = t('profile.switcher.current', { name: sessionHandle(session) });

  const choose = async (target: Session) => {
    if (accountKey(target) === active) return;
    await switchAccount(target);
    router.replace('/home');
  };

  return (
    <NativeMenu
      label={label}
      trigger="icon"
      icon={{ name: ICON, color: theme.muted }}
      groups={[
        {
          key: 'account',
          items: sessions.map((s) => ({
            key: accountKey(s),
            title: sessionHandle(s),
            icon: accountKey(s) === active ? 'checkmark' : 'person.crop.circle',
            onPress: () => void choose(s),
          })),
        },
        {
          key: 'own',
          items: [
            { key: 'add', title: t('profile.switcher.add'), icon: 'plus', onPress: () => router.push('/add-account') },
            { key: 'manage', title: t('profile.switcher.manage'), icon: 'gearshape', onPress: () => router.push('/settings') },
          ],
        },
      ]}
      renderTrigger={(open) => renderTrigger(open, label, ICON)}
    />
  );
}
